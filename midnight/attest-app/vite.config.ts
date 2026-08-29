import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// The Midnight packages are wasm-bindgen modules with top-level await, so both
// plugins are load-bearing rather than optional.
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

export default defineConfig({
  plugins: [react(), wasm(), topLevelAwait()],
  optimizeDeps: { exclude: MIDNIGHT_WASM },
  build: { target: "esnext" },
  server: { port: 5173 },
});
