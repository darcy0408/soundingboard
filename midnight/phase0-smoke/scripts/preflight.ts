/**
 * Record-day pre-flight — runs the demo checklist without submitting anything.
 *
 *   npm run preflight -w sb-phase0-smoke
 *
 * Everything the attest run needs, checked in the order it would fail:
 *   1. proof server reachable on :6300
 *   2. wallet syncs, and the snapshot is refreshed so the take never films a
 *      cold ~13 minute resync
 *   3. DUST balance covers a submission
 *   4. the contract's public ledger reads back through the indexer — the same
 *      read a third party performs, and the shot the demo ends on
 *
 * Deliberately does NOT call `attest`. The circuit is monotonic, so a probe
 * submission would consume the milestone headroom the demo needs to show a
 * real increase.
 */
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket;

import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

import { openSession, NETWORK, INDEXER_HTTP, INDEXER_WS, PROOF_SERVER } from "./wallet-session.ts";

const HERE = fileURLToPath(new URL(".", import.meta.url));

const deployment = JSON.parse(
  readFileSync(resolve(HERE, "..", "..", "deployment.json"), "utf8"),
) as { contract: string; address: string; network: string };

const CONTRACT_ADDRESS = process.env.SB_CONTRACT_ADDRESS ?? deployment.address;
const CONTRACT_DIR = resolve(
  HERE,
  "..",
  process.env.SB_CONTRACT_DIR ?? "../contract/build/practice_attestation",
);

setNetworkId(NETWORK);

const log = (m: string) => console.log(`[preflight] ${m}`);
const problems: string[] = [];
const fail = (m: string) => {
  problems.push(m);
  log(`FAIL  ${m}`);
};
const ok = (m: string) => log(`ok    ${m}`);

/** DUST is quoted in atomic units; the demo only needs a human-sized figure. */
const dustToNight = (d: bigint) => (Number(d) / 1e18).toFixed(4);

async function checkProofServer() {
  try {
    const res = await fetch(`${PROOF_SERVER}/ready`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fail(`proof server ${PROOF_SERVER}/ready returned ${res.status}`);
    const version = await fetch(`${PROOF_SERVER}/version`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.text())
      .catch(() => "unknown");
    ok(`proof server ${PROOF_SERVER} ready (v${version.trim()})`);
  } catch (e) {
    fail(`proof server ${PROOF_SERVER} unreachable — ${(e as Error).message}`);
    log("      start it with the docker command in midnight/README.md");
  }
}

async function main() {
  log(`network: ${NETWORK}`);
  await checkProofServer();

  // The proving keys are read from disk at call time, so a missing build only
  // surfaces mid-submission. Cheap to check here instead.
  try {
    await import(join(CONTRACT_DIR, "contract", "index.js"));
    ok("compiled contract present");
  } catch {
    fail(`compiled contract missing at ${CONTRACT_DIR}`);
    log("      run: npm run build -w sb-practice-attestation");
  }

  const t0 = Date.now();
  const session = await openSession();
  const { wallet } = session;
  const state = await wallet.waitForSyncedState();
  const syncSecs = ((Date.now() - t0) / 1000).toFixed(1);

  const dust = state.dust.balance(new Date());
  ok(`wallet synced in ${syncSecs}s — snapshot refreshed, next run starts warm`);
  log(`      address: ${session.address}`);
  log(`      DUST:    ${dust}  (~${dustToNight(dust)} in whole units)`);
  if (dust === 0n) fail("no DUST — a submission cannot pay its fee");

  const publicData = indexerPublicDataProvider(
    INDEXER_HTTP,
    INDEXER_WS,
    globalThis.WebSocket as never,
  );
  const contractState = await publicData.queryContractState(CONTRACT_ADDRESS);
  if (!contractState) {
    fail(`no contract state at ${CONTRACT_ADDRESS}`);
  } else {
    const ContractModule: any = await import(join(CONTRACT_DIR, "contract", "index.js"));
    const entries = [...ContractModule.ledger(contractState.data).milestones];
    ok(`contract live at ${CONTRACT_ADDRESS}`);
    log(`      milestones on chain: ${entries.length}`);
    for (const [key, value] of entries) {
      log(`        ${Buffer.from(key).toString("hex")} -> ${value}`);
    }
    // The demo shows a milestone going up. attest() requires claimed > current,
    // so a claim at or below the highest recorded value will be rejected by the
    // circuit — better to learn that now than on camera.
    const highest = entries.reduce((m, [, v]) => (BigInt(v) > m ? BigInt(v) : m), 0n);
    if (highest >= 10n) {
      fail(`highest milestone is ${highest} — the cap is 10, no headroom left to demo an increase`);
    } else if (entries.length > 0) {
      log(`      demo headroom: claim any value from ${highest + 1n} to 10`);
    }
  }

  await session.save();
  await wallet.stop();

  log("");
  if (problems.length === 0) {
    log("READY — proof server, wallet, DUST and contract all check out.");
    process.exit(0);
  }
  log(`NOT READY — ${problems.length} problem(s):`);
  for (const p of problems) log(`  - ${p}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
