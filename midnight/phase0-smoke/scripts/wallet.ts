/**
 * Phase 0 smoke test — Midnight Preview wallet.
 *
 * Creates (or reloads) a test wallet, syncs it against Preview, and prints the
 * three addresses plus balances. With --watch it polls until the faucet lands.
 *
 * Derived from midnight-wallet:managing-test-wallets/examples/create-wallet.ts,
 * retargeted from `undeployed` to `preview`.
 *
 * The seed is written OUTSIDE the repo (see SEED_PATH) because this repo is
 * public for the hackathon. Never move it inside the working tree.
 */
import WebSocket from "ws";
// The wallet SDK expects a browser-style global WebSocket.
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "node:buffer";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { HDWallet, Roles, generateRandomSeed } from "@midnight-ntwrk/wallet-sdk-hd";
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
import { MidnightBech32m } from "@midnight-ntwrk/wallet-sdk-address-format";

const NETWORK = "preview" as const;
const SEED_PATH =
  process.env.SB_WALLET_SEED_PATH ??
  join(homedir(), ".midnight-soundingboard", "preview-wallet.json");

// Indexer API version differs between the docs (v4) and the older SDK examples
// (v3); override with SB_INDEXER_API=v3 if v4 misbehaves.
const INDEXER_API = process.env.SB_INDEXER_API ?? "v4";
const INDEXER_HTTP = `https://indexer.preview.midnight.network/api/${INDEXER_API}/graphql`;
const INDEXER_WS = `wss://indexer.preview.midnight.network/api/${INDEXER_API}/graphql/ws`;

function loadOrCreateSeed(): Uint8Array {
  if (existsSync(SEED_PATH)) {
    const { seed } = JSON.parse(readFileSync(SEED_PATH, "utf8"));
    console.log(`Reusing wallet seed from ${SEED_PATH}`);
    return Buffer.from(seed, "hex");
  }
  const seed = generateRandomSeed();
  mkdirSync(dirname(SEED_PATH), { recursive: true });
  writeFileSync(
    SEED_PATH,
    JSON.stringify(
      { network: NETWORK, seed: Buffer.from(seed).toString("hex"), created: new Date().toISOString() },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(`Generated a new wallet seed at ${SEED_PATH}`);
  return seed;
}

async function main() {
  const watch = process.argv.includes("--watch");
  const seed = loadOrCreateSeed();

  const hdResult = HDWallet.fromSeed(seed);
  if (hdResult.type !== "seedOk") throw new Error(`HDWallet.fromSeed: ${hdResult.type}`);
  const derived = hdResult.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust] as const)
    .deriveKeysAt(0);
  if (derived.type !== "keysDerived") throw new Error(`deriveKeysAt: ${derived.type}`);
  hdResult.hdWallet.clear();
  const keys = derived.keys as Record<number, Uint8Array>;

  const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
  const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
  const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], NETWORK);

  const configuration: DefaultConfiguration = {
    networkId: NETWORK,
    costParameters: { feeBlocksMargin: 5 },
    relayURL: new URL("wss://rpc.preview.midnight.network"),
    provingServerUrl: new URL("http://localhost:6300"),
    indexerClientConnection: { indexerHttpUrl: INDEXER_HTTP, indexerWsUrl: INDEXER_WS },
    txHistoryStorage: new InMemoryTransactionHistoryStorage(WalletEntrySchema),
  };

  console.log(`Connecting to ${NETWORK} (indexer ${INDEXER_API})...`);
  const wallet = await WalletFacade.init({
    configuration,
    shielded: (cfg) => ShieldedWallet(cfg).startWithSecretKeys(shieldedSecretKeys),
    unshielded: (cfg) =>
      UnshieldedWallet(cfg).startWithPublicKey(PublicKey.fromKeyStore(unshieldedKeystore)),
    dust: (cfg) =>
      DustWallet(cfg).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      ),
  });

  await wallet.start(shieldedSecretKeys, dustSecretKey);

  const encAddr = (a: unknown) => MidnightBech32m.encode(NETWORK, a as never).asString();

  // Addresses are known as soon as the facade is up — they do not depend on
  // sync. Print them immediately so funding can happen while sync runs
  // (first sync on Preview takes ~15 minutes).
  let printedAddresses = false;
  const addrSub = wallet.state().subscribe((s: any) => {
    if (printedAddresses || !s?.unshielded?.address) return;
    printedAddresses = true;
    console.log("");
    console.log(`Unshielded (FUND THIS ONE): ${encAddr(s.unshielded.address)}`);
    console.log(`Shielded:                   ${encAddr(s.shielded.address)}`);
    console.log(`Dust:                       ${encAddr(s.dust.address)}`);
    console.log("");
    console.log("Faucet: https://faucet.preview.midnight.network/");
    console.log("");
  });

  // First sync against a public network can take minutes. Log progress so a
  // stall is distinguishable from slow-but-working.
  const progressSub = wallet.state().subscribe((s: any) => {
    // Sync progress carries BigInts, which JSON.stringify refuses by default.
    const p = (label: string, prog: any) =>
      prog
        ? `${label}=${JSON.stringify(prog, (_k, v) => (typeof v === "bigint" ? v.toString() : v))}`
        : `${label}=?`;
    console.log(
      `[sync] isSynced=${s.isSynced} ` +
        `${p("unshielded", s.unshielded?.progress)} ` +
        `${p("shielded", s.shielded?.progress)} ` +
        `${p("dust", s.dust?.progress)}`,
    );
  });

  let state = await wallet.waitForSyncedState();
  progressSub.unsubscribe();
  addrSub.unsubscribe();

  const enc = encAddr;
  const NIGHT = ledger.nativeToken().raw;

  console.log("");
  console.log("SYNCED.");
  console.log(`Unshielded (FUND THIS ONE): ${enc(state.unshielded.address)}`);
  console.log(`Shielded:                   ${enc(state.shielded.address)}`);
  console.log(`Dust:                       ${enc(state.dust.address)}`);
  console.log("");
  console.log(`NIGHT: ${state.unshielded.balances[NIGHT] ?? 0n}`);

  if (watch) {
    console.log("");
    console.log("Faucet: https://faucet.preview.midnight.network/");
    console.log("Waiting for NIGHT to arrive (Ctrl-C to stop)...");
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      state = await wallet.waitForSyncedState();
      const night = state.unshielded.balances[NIGHT] ?? 0n;
      if (night > 0n) {
        console.log(`Funded. NIGHT balance: ${night}`);
        break;
      }
      await new Promise((r) => setTimeout(r, 10_000));
      process.stdout.write(".");
    }
  }

  await wallet.stop();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
