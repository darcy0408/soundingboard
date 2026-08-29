/**
 * Fast pre-flight for the deploy path — no wallet, no network, no sync.
 *
 * Every deploy failure so far happened during contract construction, AFTER
 * paying a ~13 minute wallet sync. This script exercises exactly that part in
 * about a second: load the compiled module, wire witnesses, attach the file
 * assets, and read the verifier keys the way deployContract does.
 *
 * Run this before any deploy:
 *   SB_CONTRACT_NAME=practice_attestation SB_CONTRACT_DIR=build/practice_attestation \
 *     npx tsx scripts/check-contract.ts
 */
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CONTRACT_NAME = process.env.SB_CONTRACT_NAME ?? "counter";
const ZK_CONFIG_PATH = process.env.SB_CONTRACT_DIR
  ? resolve(HERE, "..", process.env.SB_CONTRACT_DIR)
  : join(HERE, "..", "build", "counter");

setNetworkId("preview");
const log = (m: string) => console.log(`[check] ${m}`);

async function main() {
  log(`contract: ${CONTRACT_NAME}`);
  log(`build dir: ${ZK_CONFIG_PATH}`);

  const ContractModule: any = await import(join(ZK_CONFIG_PATH, "contract", "index.js"));
  log("compiled module loaded");

  const witnessCombinator: any =
    CONTRACT_NAME === "practice_attestation"
      ? CompiledContract.withWitnesses(
          ((await import("../../contract/src/witnesses.ts")) as any).witnesses,
        )
      : CompiledContract.withVacantWitnesses;

  const compiledContract = CompiledContract.make(
    CONTRACT_NAME,
    ContractModule.Contract,
  ).pipe(witnessCombinator, CompiledContract.withCompiledFileAssets(ZK_CONFIG_PATH));
  log("CompiledContract built (witnesses + file assets attached)");

  // Reading the verifier keys is what deployContract does next, and it is where
  // a duplicate wasm module shows up as "expected instance of ...".
  const zk = new NodeZkConfigProvider<any>(ZK_CONFIG_PATH);
  // Circuit names are not reliably enumerable off the generated class, so take
  // them from the compiled keys/ directory, which is the ground truth.
  const circuits: string[] = readdirSync(join(ZK_CONFIG_PATH, "keys"))
    .filter((f) => f.endsWith(".verifier"))
    .map((f) => f.replace(/\.verifier$/, ""));
  if (circuits.length === 0) {
    throw new Error(
      `no .verifier keys in ${join(ZK_CONFIG_PATH, "keys")} — was this built with --skip-zk?`,
    );
  }
  log(`circuits: ${circuits.join(", ")}`);
  for (const c of circuits) {
    const vk = await zk.getVerifierKey(c as never);
    log(`verifier key for ${c}: ${vk ? "ok" : "MISSING"}`);
  }

  log("PRE-FLIGHT OK — safe to spend a sync on the real deploy.");
  process.exit(0);
}

main().catch((e) => {
  console.error("[check] PRE-FLIGHT FAILED:");
  console.error(e);
  process.exit(1);
});
