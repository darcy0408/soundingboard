/**
 * Phase 0 checkpoint — deploy the compact-examples counter to Midnight Preview.
 *
 * Does the whole tail of Phase 0 in one run, because a first wallet sync
 * against Preview costs ~15 minutes and we do not want to pay it twice:
 *
 *   sync wallet -> check NIGHT -> register NIGHT for DUST -> wait for DUST
 *   -> build providers -> deployContract -> print contract address
 *
 * Stack is pinned to the Preview compatibility matrix (see README.md):
 * compiler 0.31.1 / compact-runtime 0.16.0 / ledger-v8 / midnight-js 4.1.1 /
 * proof server 8.1.0.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import {
  WalletFacade,
  WalletEntrySchema,
  type DefaultConfiguration,
} from "@midnight-ntwrk/wallet-sdk-facade";
import { ShieldedWallet } from "@midnight-ntwrk/wallet-sdk-shielded";
import {
  UnshieldedWallet,
  createKeystore,
  PublicKey,
} from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";
import { DustWallet } from "@midnight-ntwrk/wallet-sdk-dust-wallet";
import { InMemoryTransactionHistoryStorage } from "@midnight-ntwrk/wallet-sdk-abstractions";
import * as ledger from "@midnight-ntwrk/ledger-v8";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { deployContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";

const NETWORK = "preview" as const;
const HERE = fileURLToPath(new URL(".", import.meta.url));

// Defaults deploy the Phase 0 counter smoke test. Override to deploy any other
// compiled contract, e.g. the Practice Proof circuit:
//   SB_CONTRACT_NAME=practice_attestation \
//   SB_CONTRACT_DIR=../contract/build/practice_attestation \
//   npx tsx scripts/deploy.ts
const CONTRACT_NAME = process.env.SB_CONTRACT_NAME ?? "counter";
const ZK_CONFIG_PATH = process.env.SB_CONTRACT_DIR
  ? resolve(HERE, "..", process.env.SB_CONTRACT_DIR)
  : join(HERE, "..", "build", "counter");

const SEED_PATH =
  process.env.SB_WALLET_SEED_PATH ??
  join(homedir(), ".midnight-soundingboard", "preview-wallet.json");
const INDEXER_API = process.env.SB_INDEXER_API ?? "v3";
const INDEXER_HTTP = `https://indexer.preview.midnight.network/api/${INDEXER_API}/graphql`;
const INDEXER_WS = `wss://indexer.preview.midnight.network/api/${INDEXER_API}/graphql/ws`;
const PROOF_SERVER = "http://localhost:6300";

const log = (m: string) => console.log(`[deploy] ${m}`);

// midnight-js keeps the network id in module-global state and throws
// "Network ID has not been configured" from deep inside deployContract if it
// is unset. Must happen before any wallet or contract operation.
setNetworkId(NETWORK);

async function main() {
  const { seed } = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
  if (hd.type !== "seedOk") throw new Error(`HDWallet.fromSeed: ${hd.type}`);
  const derived = hd.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error(`deriveKeysAt: ${derived.type}`);
  hd.hdWallet.clear();
  const keys = derived.keys as Record<number, Uint8Array>;

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const keystore = createKeystore(keys[Roles.NightExternal], NETWORK);
  const address = (PublicKey.fromKeyStore(keystore) as any).address;

  const configuration: DefaultConfiguration = {
    networkId: NETWORK,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL("wss://rpc.preview.midnight.network"),
    provingServerUrl: new URL(PROOF_SERVER),
    indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  log(`wallet ${address}`);
  log(`connecting to ${NETWORK} (indexer ${INDEXER_API}), first sync takes ~15 min...`);

  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(keystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });
  await wallet.start(shieldedSecretKeys, dustSecretKey);

  let ticks = 0;
  const progressSub = wallet.state().subscribe((s: any) => {
    if (ticks++ % 20 !== 0) return;
    const sh = s?.shielded?.progress;
    log(
      `sync isSynced=${s.isSynced}` +
        (sh ? ` shielded ${sh.appliedIndex}/${sh.highestRelevantWalletIndex}` : ""),
    );
  });

  let state = await wallet.waitForSyncedState();
  progressSub.unsubscribe();
  log("synced.");

  const NIGHT = ledger.nativeToken().raw;
  const night = state.unshielded.balances[NIGHT] ?? 0n;
  log(`NIGHT balance: ${night}`);

  if (night === 0n) {
    log("");
    log("NOT FUNDED. Paste this address into https://faucet.preview.midnight.network/");
    log(`  ${address}`);
    log("Then re-run this script.");
    await wallet.stop();
    process.exit(2);
  }

  // --- DUST: fees are paid in DUST, which is generated by REGISTERED NIGHT. ---
  let dust = state.dust.balance(new Date());
  log(`DUST balance: ${dust}`);

  if (dust === 0n) {
    const utxos = (state.unshielded as any).availableCoins ?? [];
    log(`registering ${utxos.length} NIGHT UTXO(s) for DUST generation...`);

    const estimate = await (wallet as any).estimateRegistration(utxos);
    log(`estimated registration fee: ${estimate.fee}`);

    // Registration is self-funding: it pays its fee out of the DUST the
    // registered UTXOs generate, so a 0 DUST balance here is expected.
    // It signs internally, but needs the verifying key and a sign callback
    // passed explicitly — omitting them fails deep in wasm (addressFromKey
    // on undefined), not with a helpful arity error.
    const recipe = await (wallet as any).registerNightUtxosForDustGeneration(
      utxos,
      keystore.getPublicKey(),
      (payload: unknown) => keystore.signData(payload as never),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    const txId = await wallet.submitTransaction(finalized);
    log(`registration tx: ${txId}`);

    log("waiting for DUST to accrue...");
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15_000));
      state = await wallet.waitForSyncedState();
      dust = state.dust.balance(new Date());
      log(`DUST balance: ${dust}`);
      if (dust > 0n) break;
    }
    if (dust === 0n) throw new Error("DUST never accrued; cannot pay deploy fee.");
  }

  // --- Providers ---
  const synced = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: any) => s.isSynced)));
  const walletProvider: any = {
    getCoinPublicKey: () => (synced as any).shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => (synced as any).shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys, dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return await wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => wallet.submitTransaction(tx),
  };

  const ContractModule: any = await import(join(ZK_CONFIG_PATH, "contract", "index.js"));
  // withVacantWitnesses is only for contracts that declare NO witnesses (the
  // counter). Practice Proof declares practiceSecretKey and sessionCommitments,
  // and the generated Contract constructor rejects vacant stubs outright:
  //   "first (witnesses) argument ... does not contain a function-valued field
  //    named practiceSecretKey"
  // so the real implementations have to be supplied even to deploy.
  // Both combinators must go in ONE pipe() — the value returned by pipe() is
  // not itself pipeable.
  // One untyped view of the CompiledContract namespace, used for every call in
  // this block. ContractModule comes from a runtime import() of compiler output,
  // so its generics are unknown to tsc; each combinator then resolves its own
  // overloads to `never` and rejects perfectly valid arguments. The assertions
  // are erased at compile time and change nothing at runtime, and the rest of
  // the file stays checked — which is the point of having a tsconfig here.
  const CC: any = CompiledContract;

  const witnessCombinator: any =
    CONTRACT_NAME === "practice_attestation"
      ? CC.withWitnesses(
          ((await import("../../contract/src/witnesses.ts")) as any).witnesses,
        )
      : CC.withVacantWitnesses;

  const compiledContract: any = CC.make(CONTRACT_NAME, ContractModule.Contract).pipe(
    witnessCombinator,
    CC.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  const zkConfigProvider = new NodeZkConfigProvider<any>(ZK_CONFIG_PATH);
  const providers: any = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "sb-phase0-counter",
      privateStoragePasswordProvider: () => "phase0-smoke-test",
      accountId: keystore.getBech32Address().toString(),
    }),
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(PROOF_SERVER, zkConfigProvider),
    walletProvider,
    midnightProvider: walletProvider,
  };

  // The counter holds no private state. Practice Proof stores a device-local
  // secret plus a fixed-width commitment vector (MAX_SESSIONS = 10). Deploying
  // does not execute any circuit, so the commitments start zero-filled; real
  // ones are supplied when attest() is called.
  const initialPrivateState =
    CONTRACT_NAME === "practice_attestation"
      ? {
          secretKey: new Uint8Array(randomBytes(32)),
          commitments: Array.from({ length: 10 }, () => new Uint8Array(32)),
        }
      : {};

  log(`deploying ${CONTRACT_NAME} (proof generation takes 30-60s)...`);
  // deployContract is generic over the contract type, which is unknowable here
  // for the same reason as CC above: the contract arrives from a runtime import().
  // Neither overload binds, so the call is made through an untyped alias.
  const deployed: any = await (deployContract as any)(providers, {
    compiledContract,
    privateStateId: `${CONTRACT_NAME}PrivateState`,
    initialPrivateState,
  });

  const pub = deployed.deployTxData.public;
  log("");
  log("=== PHASE 0 CHECKPOINT ===");
  log(`contract address: ${pub.contractAddress}`);
  log(`deploy tx:        ${pub.txId}`);
  log(`block height:     ${pub.blockHeight}`);
  log(`explorer:         https://preview.midnightexplorer.com/`);

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
