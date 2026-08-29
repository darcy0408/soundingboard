// Network and deployment configuration for the attest dApp.
//
// The contract address is NOT duplicated here — it comes from midnight/deployment.json,
// the single source of truth shared with phase0-smoke/scripts/attest.ts. Redeploying
// means editing that one file.
import deployment from "../../../deployment.json";

export const DEPLOYMENT = deployment as {
  network: string;
  contract: string;
  address: string;
  deployTxId: string;
  deployTxHash: string;
  blockHeight: number;
  indexer: { http: string; ws: string };
};

export const NETWORK_ID = DEPLOYMENT.network;
export const CONTRACT_ADDRESS = DEPLOYMENT.address;
export const INDEXER_HTTP = DEPLOYMENT.indexer.http;
export const INDEXER_WS = DEPLOYMENT.indexer.ws;

/**
 * The proof server MUST be the local one.
 *
 * Midnight offers a hosted proof server, and using it would work. It would also
 * hand every witness value — the device secret and every session commitment — to
 * a third party, which is precisely what this project claims not to do. Proving
 * locally is the entire privacy argument, so the default is localhost and there
 * is no UI to change it.
 */
export const PROOF_SERVER = "http://localhost:6300";

/** Where stage-zk.mjs puts keys/ and zkir/ for FetchZkConfigProvider. */
export const ZK_CONFIG_BASE = `${window.location.origin}/zk`;

export const EXPLORER = "https://preview.midnightexplorer.com/";
