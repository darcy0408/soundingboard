// Reading the public ledger — the verification half of the dApp.
//
// This path needs no wallet, no proof server, and no browser extension. That is
// the point: an attestation is only worth something if a third party can check it
// without the attester's cooperation. Anyone can open this page and read the same
// map the contract writes.
//
// The compiled contract module is imported straight from the compiler output
// because the decoder for `milestones` is generated alongside the circuit — the
// same `ledger()` function the headless script uses. It is a build artifact, so
// `npm run build -w sb-practice-attestation` has to have run; stage-zk.mjs checks
// that before dev/build and fails loudly if it has not.
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

import * as ContractModule from "../../../contract/build/practice_attestation/contract/index.js";
import { CONTRACT_ADDRESS, INDEXER_HTTP, INDEXER_WS, NETWORK_ID } from "./config";

// midnight-js keeps the network id in module-global state and throws
// "Network ID has not been configured" from deep inside the providers if unset.
setNetworkId(NETWORK_ID as never);

export type Milestone = {
  /** The on-chain identity: a hash of a device-local secret. Not a wallet address. */
  identity: string;
  /** The attested number of completed practice sessions. */
  claimed: number;
};

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

let provider: ReturnType<typeof indexerPublicDataProvider> | undefined;

/**
 * The third argument is not optional in practice, only in the type.
 *
 * indexerPublicDataProvider defaults its websocket implementation to the node
 * `ws` package, which resolves to isomorphic-ws/browser.js in a bundle — and that
 * file exports no `WebSocket`. The default is therefore `undefined` here, and any
 * subscription would fail on a value that was never there. Browsers have had a
 * native WebSocket for as long as they have had anything, so hand it over.
 */
const publicData = () =>
  (provider ??= indexerPublicDataProvider(
    INDEXER_HTTP,
    INDEXER_WS,
    globalThis.WebSocket as never,
  ));

export class ContractNotFoundError extends Error {
  constructor(address: string) {
    super(`No contract state at ${address} on ${NETWORK_ID}.`);
    this.name = "ContractNotFoundError";
  }
}

/**
 * Reads every attestation currently recorded on chain.
 *
 * The returned list IS the contract's entire public footprint. There is no other
 * public state to read — no transcripts, no scores, no timestamps, no session
 * count beyond the milestone itself.
 */
export async function readMilestones(): Promise<Milestone[]> {
  const state = await publicData().queryContractState(CONTRACT_ADDRESS);
  if (!state) throw new ContractNotFoundError(CONTRACT_ADDRESS);

  const decoded = (ContractModule as never as { ledger: (d: unknown) => LedgerShape }).ledger(
    (state as { data: unknown }).data,
  );

  const out: Milestone[] = [];
  for (const [key, value] of decoded.milestones) {
    out.push({ identity: toHex(key), claimed: Number(value) });
  }
  // Highest milestone first — the interesting end of the list.
  return out.sort((a, b) => b.claimed - a.claimed || a.identity.localeCompare(b.identity));
}

type LedgerShape = {
  milestones: {
    isEmpty(): boolean;
    size(): bigint;
    member(key: Uint8Array): boolean;
    lookup(key: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>;
  };
};
