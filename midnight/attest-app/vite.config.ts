import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";

// The Midnight packages are wasm-bindgen modules that use top-level await.
//
// vite-plugin-wasm is load-bearing: without it the .wasm imports inside
// compact-runtime and ledger-v8 do not resolve.
//
// vite-plugin-top-level-await is deliberately NOT used, despite being the usual
// companion. It rewrites TLA for targets that cannot run it, doing so through
// SWC at generateBundle time — and against Vite 8, whose bundler is rolldown
// rather than rollup, that pass dies with `missing field 'type'` out of
// Compiler.printSync. It is also unnecessary here: `build.target: "esnext"`
// below keeps TLA in the output, and every browser that can run wasm-bindgen
// modules has supported it natively for years.
//
// optimizeDeps.exclude matters for the same reason the workspace exists: esbuild
// pre-bundling can produce a SECOND copy of a wasm module, and wasm-bindgen
// identity-checks classes per module instance. That surfaces as
// "expected instance of <SomeType>" — an error naming a type, not a version.
// Four deploy attempts were lost to that class of bug in Phase 0/1.
const MIDNIGHT_WASM = [
  "@midnight-ntwrk/ledger-v8",
  "@midnight-ntwrk/compact-runtime",
  "@midnight-ntwrk/onchain-runtime-v3",
];

// Excluding compact-runtime from pre-bundling also excludes its dependencies,
// and object-inspect is CommonJS. Served raw as native ESM in dev, importing it
// fails with "does not provide an export named 'default'" — a dev-only break,
// since the production bundler does its own CJS interop. Naming it here has Vite
// convert that one leaf package to ESM while the wasm packages above stay
// excluded, so the duplicate-module protection is not traded away for it.
// The "parent > child" form is what reaches a transitive dependency of an
// EXCLUDED package; a bare "object-inspect" is silently ignored here, because
// nothing in the app's own import graph names it.
const CJS_DEPS = ["@midnight-ntwrk/compact-runtime > object-inspect"];

export default defineConfig({
  plugins: [react(), wasm()],
  optimizeDeps: { exclude: MIDNIGHT_WASM, include: CJS_DEPS },
  build: { target: "esnext" },
  server: {
    port: 5173,
    // This repo is edited from Windows while the toolchain runs in WSL, so the
    // source lives on /mnt/c — a drvfs mount that does not deliver inotify
    // events. Without polling the dev server never sees a save: no HMR, and
    // even a full reload keeps serving the module it transformed at startup,
    // which looks like a browser cache problem and is not one.
    watch: { usePolling: true, interval: 300 },
  },
});
