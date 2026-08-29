// Detecting a Midnight browser wallet.
//
// Deliberately limited to DETECTION and CONNECTION. Building, proving and
// submitting a call transaction through the extension is not implemented here,
// because it could not be tested: the only Lace install available while this was
// built was pointed at mainnet, and shipping an untested transaction path would
// invite someone to demo it. The headless `npm run attest -w sb-phase0-smoke`
// does the full proof-and-submit and is the path this project actually exercises.
//
// What this does earn its place for: telling you whether a wallet is present and
// which network it agreed to connect on. Lace defaults to mainnet, and a wallet
// silently on the wrong network is the failure that costs an hour.
import type { ConnectedAPI, InitialAPI } from "@midnight-ntwrk/dapp-connector-api";

import { NETWORK_ID } from "./config";

export type DetectedWallet = {
  /** The key under window.midnight — a wallet may inject several API versions. */
  key: string;
  name: string;
  rdns: string;
  icon: string;
  apiVersion: string;
};

/**
 * Wallets inject themselves into `window.midnight` asynchronously, so a read at
 * module load time finds nothing. Callers should poll briefly on mount.
 */
export function detectWallets(): DetectedWallet[] {
  const injected = window.midnight;
  if (!injected) return [];
  return Object.entries(injected)
    .filter((entry): entry is [string, InitialAPI] => Boolean(entry[1]?.connect))
    .map(([key, api]) => ({
      key,
      // Wallet-supplied strings are untrusted: render them as text, never as HTML.
      name: String(api.name ?? key),
      rdns: String(api.rdns ?? ""),
      icon: String(api.icon ?? ""),
      apiVersion: String(api.apiVersion ?? "?"),
    }));
}

export type ConnectionResult = {
  api: ConnectedAPI;
  /** The unshielded address the wallet reports — its identity for funding. */
  address: string;
  /** DUST available to pay a submission fee. Zero means NIGHT is unregistered. */
  dust: bigint;
};

/**
 * Connects, then reports the two things that actually decide whether a
 * submission could succeed: which address the wallet is on, and whether it holds
 * any DUST. Preview NIGHT generates DUST only after it has been registered, so a
 * funded-looking wallet with zero DUST still cannot pay a fee.
 */
export async function connectWallet(key: string): Promise<ConnectionResult> {
  const injected = window.midnight?.[key];
  if (!injected) throw new Error(`No wallet registered under window.midnight.${key}`);

  const api = await injected.connect(NETWORK_ID);
  const { unshieldedAddress } = await api.getUnshieldedAddress();
  const { balance } = await api.getDustBalance();

  return { api, address: unshieldedAddress, dust: balance };
}
