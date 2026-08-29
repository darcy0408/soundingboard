// Stage the compiled ZK config where the browser can fetch it.
//
// The headless deploy scripts use NodeZkConfigProvider and read keys/ + zkir/
// straight off disk. The browser cannot, so FetchZkConfigProvider pulls them
// over HTTP instead — which means they have to be served as static assets.
// Vite serves public/ at the site root, so public/zk/keys/attest.prover ends up
// at /zk/keys/attest.prover, and the provider's base URL is /zk.
//
// Copied rather than symlinked: Windows symlinks need elevation, and this repo
// is developed from Windows with the toolchain in WSL.
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(HERE, "..", "..", "contract", "build", "practice_attestation");
const DEST = resolve(HERE, "..", "public", "zk");

const exists = async (p) => stat(p).then(() => true, () => false);

if (!(await exists(BUILD))) {
  console.error(`[stage-zk] no contract build at ${BUILD}`);
  console.error("[stage-zk] run `npm run build -w sb-practice-attestation` from midnight/ first.");
  console.error("[stage-zk] note: `build:fast` uses --skip-zk and produces NO keys/ — it cannot be used here.");
  process.exit(1);
}

for (const dir of ["keys", "zkir"]) {
  const from = join(BUILD, dir);
  if (!(await exists(from))) {
    console.error(`[stage-zk] ${dir}/ missing from the build — was it compiled with --skip-zk?`);
    process.exit(1);
  }
  await mkdir(join(DEST, dir), { recursive: true });
  await cp(from, join(DEST, dir), { recursive: true });
  console.log(`[stage-zk] ${dir}/ -> public/zk/${dir}/`);
}
console.log("[stage-zk] ok");
