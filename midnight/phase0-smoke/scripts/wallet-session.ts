/**
 * A Preview wallet session that does not re-pay the sync.
 *
 * The first sync against Preview scans every block the wallet could be involved
 * in — ~165k blocks and ~13 minutes when Phase 1 deployed. Paying that on every
 * run makes the submit/debug loop unusable and a live demo impossible, so this
 * module snapshots wallet state to disk and restores from it.
 *
 * All three wallets expose the same pair: `serializeState(): Promise<string>` to
 * snapshot, and a static `restore(serialized)` to rebuild instead of rescanning.
 * `WalletFacade` itself exposes neither, so the wallet instances are captured
 * from the init callbacks where they are constructed.
 *
 * The snapshot lives beside the seed in ~/.midnight-soundingboard/, NEVER in the
 * repo: this repo is public, and wallet state is not something to publish even
 * when it holds no keys.
 *
 * Stack pinned to the Preview compatibility matrix (see ../../README.md):
 * compact-runtime 0.16.0 / ledger-v8 / midnight-js 4.1.1 / proof server 8.1.0.
 */
import { Buffer } from "node:buffer";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

export const NETWORK = "preview" as const;

const INDEXER_API = process.env.SB_INDEXER_API ?? "v3";
export const INDEXER_HTTP = `https://indexer.preview.midnight.network/api/${INDEXER_API}/graphql`;
export const INDEXER_WS = `wss://indexer.preview.midnight.network/api/${INDEXER_API}/graphql/ws`;
export const PROOF_SERVER = process.env.SB_PROOF_SERVER ?? "http://localhost:6300";

const SEED_PATH =
  process.env.SB_WALLET_SEED_PATH ??
  join(homedir(), ".midnight-soundingboard", "preview-wallet.json");

// Snapshot format version. Bump to invalidate every cached snapshot at once if
// an SDK upgrade changes what restore() accepts.
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_PATH =
  process.env.SB_WALLET_STATE_PATH ??
  join(homedir(), ".midnight-soundingboard", "preview-wallet-state.json");

type Snapshot = {
  version: number;
  network: string;
  shielded: string;
  unshielded: string;
  dust: string;
};

export type Session = {
  wallet: any;
  /** Bech32m address for the unshielded (NIGHT) side — the faucet target. */
  address: string;
  keystore: any;
  shieldedSecretKeys: any;
  dustSecretKey: any;
  /** Snapshots current wallet state to disk so the next run skips the rescan. */
  save: () => Promise<void>;
};

const log = (m: string) => console.log(`[wallet] ${m}`);

function readSnapshot(): Snapshot | undefined {
  if (process.env.SB_WALLET_NO_CACHE === "1") {
    log("SB_WALLET_NO_CACHE=1 — forcing a full resync.");
    return undefined;
  }
  if (!existsSync(SNAPSHOT_PATH)) return undefined;
  try {
    const snap = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
    if (snap.version !== SNAPSHOT_VERSION || snap.network !== NETWORK) {
      log(`snapshot is for ${snap.network} v${snap.version}, ignoring it.`);
      return undefined;
    }
    if (!snap.shielded || !snap.unshielded || !snap.dust) return undefined;
    return snap;
  } catch (e) {
    log(`snapshot unreadable (${(e as Error).message}); resyncing from scratch.`);
    return undefined;
  }
}

/**
 * Boots the wallet, restoring from the on-disk snapshot when there is one.
 *
 * A snapshot the SDK refuses is not fatal: restore() throws from inside a
 * WalletFacade.init callback, which fails init as a whole, so the whole boot is
 * retried once from a cold start. That keeps a stale snapshot from bricking the
 * script on the morning of a deadline — it costs a resync, not a debug session.
 */
export async function openSession(): Promise<Session> {
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

  // Captured from the init callbacks: the facade does not expose the underlying
  // wallets, and these are the only objects that can serialize their own state.
  let shieldedRef: any;
  let unshieldedRef: any;
  let dustRef: any;

  const boot = async (snap: Snapshot | undefined) => {
    const wallet = await WalletFacade.init({
      configuration,
      shielded: (cfg: any) => {
        const w = ShieldedWallet(cfg);
        shieldedRef = snap ? w.restore(snap.shielded) : w.startWithSecretKeys(shieldedSecretKeys);
        return shieldedRef;
      },
      unshielded: (cfg: any) => {
        const w = UnshieldedWallet(cfg);
        unshieldedRef = snap
          ? w.restore(snap.unshielded)
          : w.startWithPublicKey(PublicKey.fromKeyStore(keystore));
        return unshieldedRef;
      },
      dust: (cfg: any) => {
        const w = DustWallet(cfg);
        dustRef = snap
          ? w.restore(snap.dust)
          : w.startWithSecretKey(
              dustSecretKey,
              ledger.LedgerParameters.initialParameters().dust,
            );
        return dustRef;
      },
    } as any);
    await wallet.start(shieldedSecretKeys, dustSecretKey);
    return wallet;
  };

  const snap = readSnapshot();
  log(`wallet ${address}`);

  let wallet: any;
  if (snap) {
    log("restoring wallet state from snapshot (skips the ~13 min rescan)...");
    try {
      wallet = await boot(snap);
    } catch (e) {
      log(`restore rejected by the SDK (${(e as Error).message}).`);
      log("falling back to a cold sync; this takes ~13 min.");
      wallet = await boot(undefined);
    }
  } else {
    log(`cold sync against ${NETWORK} (indexer ${INDEXER_API}), ~13 min...`);
    wallet = await boot(undefined);
  }

  // Progress is only interesting on a cold sync, but a restored wallet still has
  // a short catch-up to run, so the subscription covers both.
  let ticks = 0;
  const progressSub = wallet.state().subscribe((s: any) => {
    if (ticks++ % 20 !== 0) return;
    const sh = s?.shielded?.progress;
    log(
      `sync isSynced=${s.isSynced}` +
        (sh ? ` shielded ${sh.appliedIndex}/${sh.highestRelevantWalletIndex}` : ""),
    );
  });
  await wallet.waitForSyncedState();
  progressSub.unsubscribe();
  log("synced.");

  const save = async () => {
    try {
      const next: Snapshot = {
        version: SNAPSHOT_VERSION,
        network: NETWORK,
        shielded: await shieldedRef.serializeState(),
        unshielded: await unshieldedRef.serializeState(),
        dust: await dustRef.serializeState(),
      };
      mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
      writeFileSync(SNAPSHOT_PATH, JSON.stringify(next), { mode: 0o600 });
      log(`snapshot saved -> ${SNAPSHOT_PATH}`);
    } catch (e) {
      // A failed snapshot costs the next run a resync. It must never fail a
      // transaction that already succeeded on-chain.
      log(`WARNING: could not save snapshot: ${(e as Error).message}`);
    }
  };

  return { wallet, address, keystore, shieldedSecretKeys, dustSecretKey, save };
}
