// Re-export of the shared witness-file format so the rest of the dApp imports
// from one place rather than reaching across the workspace at every call site.
//
// The definition lives with the contract (midnight/contract/src/witness-file.ts)
// because the circuit is what actually enforces the format; this dApp and the
// headless attest script are both just readers of it.
export {
  parseWitnessFile,
  assertClaimable,
  realCommitmentCount,
  toPrivateState,
  bytesToHex,
  hexToBytes,
  WitnessFileError,
  ZERO_COMMITMENT,
  MAX_SESSIONS,
  COMMITMENT_BYTES,
  WITNESS_FILE_VERSION,
  type WitnessFile,
} from "../../../contract/src/witness-file";
