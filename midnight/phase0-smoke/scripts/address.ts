/**
 * Print the Preview unshielded address for the Phase 0 wallet seed.
 *
 * Deliberately does NOT construct a WalletFacade: addresses are pure key
 * derivation, so this returns instantly instead of waiting ~15 minutes for a
 * first sync. Use this to get the faucet address while a sync runs elsewhere.
 */
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { HDWallet, Roles } from "@midnight-ntwrk/wallet-sdk-hd";
import { createKeystore, PublicKey } from "@midnight-ntwrk/wallet-sdk-unshielded-wallet";

const NETWORK = "preview" as const;
const SEED_PATH =
  process.env.SB_WALLET_SEED_PATH ??
  join(homedir(), ".midnight-soundingboard", "preview-wallet.json");

const { seed } = JSON.parse(readFileSync(SEED_PATH, "utf8"));
const hd = HDWallet.fromSeed(Buffer.from(seed, "hex"));
if (hd.type !== "seedOk") throw new Error(`HDWallet.fromSeed: ${hd.type}`);

const derived = hd.hdWallet
  .selectAccount(0)
  .selectRoles([Roles.NightExternal] as const)
  .deriveKeysAt(0);
if (derived.type !== "keysDerived") throw new Error(`deriveKeysAt: ${derived.type}`);
const keys = derived.keys as Record<number, Uint8Array>;

const keystore = createKeystore(keys[Roles.NightExternal], NETWORK);
const pk: any = PublicKey.fromKeyStore(keystore);

// PublicKey already carries a bech32m-encoded address for the network the
// keystore was built with — MidnightBech32m.encode() is not needed here (it
// expects a branded ledger type, not this plain object).
if (typeof pk?.address !== "string") {
  throw new Error(`Unexpected PublicKey shape: ${JSON.stringify(Object.keys(pk ?? {}))}`);
}
console.log(`UNSHIELDED_ADDRESS=${pk.address}`);
console.log(`Faucet: https://faucet.preview.midnight.network/`);
