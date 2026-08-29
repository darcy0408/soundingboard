/**
 * Phase 2 — submit a Practice Proof attestation to the deployed contract.
 *
 * This is the headless twin of the browser dApp. It exists because the demo must
 * not hard-depend on the Lace extension: everything the dApp does (load a witness
 * file, prove `attest` locally, submit, read the receipt back) happens here with
 * no browser involved, so the flow can be proven, timed, and re-run from a
 * terminal.
 *
 *   npm run attest -w sb-phase0-smoke
 *   SB_WITNESS_FILE=/path/to/exported.json SB_CLAIMED=5 npm run attest -w sb-phase0-smoke
 *
 * Nothing in the witness file reaches the chain. The proof is generated against
 * the LOCAL proof server; the transaction carries the proof, the identity hash,
 * and the claimed milestone — no commitments and no secret.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import * as Rx from "rxjs";

import { openSession, NETWORK, INDEXER_HTTP, INDEXER_WS, PROOF_SERVER } from "./wallet-session.ts";
import {
  parseWitnessFile,
  assertClaimable,
  toPrivateState,
  type WitnessFile,
} from "../../contract/src/witness-file.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const deployment = JSON.parse(
  readFileSync(resolve(HERE, "..", "..", "deployment.json"), "utf8"),
) as { contract: string; address: string; network: string };

const CONTRACT_NAME = deployment.contract;
const CONTRACT_ADDRESS = process.env.SB_CONTRACT_ADDRESS ?? deployment.address;
const ZK_CONFIG_PATH = resolve(
  HERE,
  "..",
  process.env.SB_CONTRACT_DIR ?? "../contract/build/practice_attestation",
);
const WITNESS_FILE = resolve(
  HERE,
  "..",
  process.env.SB_WITNESS_FILE ?? "../contract/test/fixtures/sample-witness.json",
);

// midnight-js keeps the network id in module-global state and throws
// "Network ID has not been configured" from deep inside the call machinery if it
// is unset. Must happen before any wallet or contract operation.
setNetworkId(NETWORK);

const log = (m: string) => console.log(`[attest] ${m}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const loadWitness = (path: string): WitnessFile =>
  parseWitnessFile(JSON.parse(readFileSync(path, "utf8")), path);

async function main() {
  const witness = loadWitness(WITNESS_FILE);

  // A user may attest to LESS than the file supports — the circuit allows it,
  // and it leaves room to demonstrate a later milestone increase — so the
  // chosen value is re-checked against the file rather than assumed valid.
  const claimed = Number(process.env.SB_CLAIMED ?? witness.claimed);
  assertClaimable(witness, claimed, `SB_CLAIMED=${claimed}`);

  log(`witness file: ${WITNESS_FILE}`);
  log(`contract:     ${CONTRACT_NAME} @ ${CONTRACT_ADDRESS}`);
  log(`claiming:     ${claimed} session(s)`);

  const session = await openSession();
  const { wallet } = session;

  const state = await wallet.waitForSyncedState();
  const dust = state.dust.balance(new Date());
  log(`DUST balance: ${dust}`);
  if (dust === 0n) {
    log("");
    log("NO DUST — an attest submission cannot pay its fee.");
    log("Run `npm run deploy -w sb-phase0-smoke` once to register NIGHT for DUST,");
    log("or wait for DUST to accrue against already-registered NIGHT.");
    await wallet.stop();
    process.exit(2);
  }

  const synced = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s: any) => s.isSynced)));
  const walletProvider: any = {
    getCoinPublicKey: () => (synced as any).shielded.coinPublicKey.toHexString(),
    getEncryptionPublicKey: () => (synced as any).shielded.encryptionPublicKey.toHexString(),
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await wallet.balanceUnboundTransaction(
        tx,
        {
          shieldedSecretKeys: session.shieldedSecretKeys,
          dustSecretKey: session.dustSecretKey,
        },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      return await wallet.finalizeRecipe(recipe);
    },
    submitTx: (tx: any) => wallet.submitTransaction(tx),
  };

  const ContractModule: any = await import(join(ZK_CONFIG_PATH, "contract", "index.js"));

  // One untyped view of the CompiledContract namespace. ContractModule comes from
  // a runtime import() of compiler output, so its generics are unknown to tsc and
  // each combinator resolves its overloads to `never`. Erased at compile time.
  const CC: any = CompiledContract;
  const compiledContract: any = CC.make(CONTRACT_NAME, ContractModule.Contract).pipe(
    CC.withWitnesses(((await import("../../contract/src/witnesses.ts")) as any).witnesses),
    CC.withCompiledFileAssets(ZK_CONFIG_PATH),
  );

  const zkConfigProvider = new NodeZkConfigProvider<any>(ZK_CONFIG_PATH);

  // Proving is the number the live demo depends on, and it is the one thing
  // deploying never measured — deploying a contract does not execute a circuit.
  // Wrapping proveTx isolates it from wallet sync, balancing, and finalization,
  // all of which are in the wall-clock time of the call but are not proving.
  const innerProofProvider: any = httpClientProofProvider(PROOF_SERVER, zkConfigProvider);
  let proveMs = 0;
  const proofProvider: any = {
    proveTx: async (tx: any, config?: any) => {
      log(`proving attest(${claimed}) on ${PROOF_SERVER} ...`);
      const t0 = Date.now();
      try {
        return await innerProofProvider.proveTx(tx, config);
      } finally {
        proveMs = Date.now() - t0;
        log(`proof generated in ${secs(proveMs)}`);
      }
    },
  };

  const providers: any = {
    privateStateProvider: levelPrivateStateProvider({
      privateStateStoreName: "sb-practice-proof",
      privateStoragePasswordProvider: () => "practice-proof-local",
      accountId: session.keystore.getBech32Address().toString(),
    }),
    publicDataProvider: indexerPublicDataProvider(INDEXER_HTTP, INDEXER_WS),
    zkConfigProvider,
    proofProvider,
    walletProvider,
    midnightProvider: walletProvider,
  };

  // The witness file IS the private state. Passing initialPrivateState here
  // deliberately overwrites whatever is cached under this private state id —
  // the file is the source of truth for who is attesting and to what.
  const initialPrivateState = toPrivateState(witness);

  log("connecting to the deployed contract...");
  const found: any = await (findDeployedContract as any)(providers, {
    compiledContract,
    contractAddress: CONTRACT_ADDRESS,
    privateStateId: `${CONTRACT_NAME}PrivateState`,
    initialPrivateState,
  });

  log("submitting attest transaction (proof + balance + finalize)...");
  const t0 = Date.now();
  const result: any = await found.callTx.attest(BigInt(claimed));
  const totalMs = Date.now() - t0;

  const pub = result.public;
  log("");
  log("=== ATTESTATION SUBMITTED ===");
  log(`claimed milestone: ${claimed}`);
  log(`status:            ${pub.status}`);
  log(`tx id:             ${pub.txId}`);
  log(`tx hash:           ${pub.txHash}`);
  log(`block height:      ${pub.blockHeight}`);
  log(`proving time:      ${secs(proveMs)}`);
  log(`total submit time: ${secs(totalMs)}`);

  // Read the ledger back through the indexer rather than trusting the local
  // result object — this is the same read a third party performs to verify an
  // attestation, and it is the only thing that proves the receipt is public.
  log("");
  log("reading the public ledger back from the indexer...");
  const contractState = await providers.publicDataProvider.queryContractState(CONTRACT_ADDRESS);
  if (!contractState) throw new Error("contract state not found at the deployed address");

  const ledgerState: any = ContractModule.ledger(contractState.data);
  const entries = [...ledgerState.milestones];
  log(`milestones on chain: ${entries.length}`);
  for (const [key, value] of entries) {
    const hex = Buffer.from(key).toString("hex");
    log(`  ${hex} -> ${value}`);
  }

  await session.save();
  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
