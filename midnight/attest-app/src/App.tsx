import { useCallback, useEffect, useMemo, useState } from "react";

import { CONTRACT_ADDRESS, DEPLOYMENT, EXPLORER, PROOF_SERVER } from "./lib/config";
import { readMilestones, type Milestone } from "./lib/ledger";
import {
  assertClaimable,
  parseWitnessFile,
  realCommitmentCount,
  WitnessFileError,
  ZERO_COMMITMENT,
  type WitnessFile,
} from "./lib/witness";

const short = (hex: string) => `${hex.slice(0, 10)}…${hex.slice(-8)}`;

/**
 * The public ledger, read live from the indexer.
 *
 * No wallet, no extension, no permission. That is the property worth
 * demonstrating: an attestation nobody else can check is not a receipt.
 */
function PublicRecord() {
  const [rows, setRows] = useState<Milestone[] | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setRows(await readMilestones());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>The public record</h2>
        <button className="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? "reading…" : "refresh"}
        </button>
      </div>
      <p className="muted">
        Everything this contract has ever made public, read straight from the Midnight
        Preview indexer. An identity, and a number. Nothing else exists on chain.
      </p>

      {error && (
        <p className="error">
          Could not read the ledger: {error}
        </p>
      )}

      {rows && rows.length === 0 && (
        <p className="muted">No attestations recorded yet.</p>
      )}

      {rows && rows.length > 0 && (
        <table className="ledger">
          <thead>
            <tr>
              <th>Identity (hash of a device secret)</th>
              <th className="num">Sessions attested</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.identity}>
                <td className="mono" title={r.identity}>
                  {short(r.identity)}
                </td>
                <td className="num strong">{r.claimed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

type Loaded = { file: WitnessFile; name: string };

/**
 * Loads an exported witness file and shows what it does and does not disclose.
 *
 * The validation here is a courtesy — the circuit enforces every one of these
 * rules itself. Running them in the browser just turns a proof that fails deep
 * inside wasm into a sentence a person can act on.
 */
function WitnessInspector() {
  const [loaded, setLoaded] = useState<Loaded | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [claimed, setClaimed] = useState(1);

  const onFile = async (file: File) => {
    setError(undefined);
    try {
      const parsed = parseWitnessFile(JSON.parse(await file.text()), file.name);
      setLoaded({ file: parsed, name: file.name });
      setClaimed(parsed.claimed);
    } catch (e) {
      setLoaded(undefined);
      setError(
        e instanceof WitnessFileError || e instanceof Error ? e.message : String(e),
      );
    }
  };

  const real = loaded ? realCommitmentCount(loaded.file) : 0;

  const claimError = useMemo(() => {
    if (!loaded) return undefined;
    try {
      assertClaimable(loaded.file, claimed, "this claim");
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }, [loaded, claimed]);

  return (
    <section className="card">
      <div className="card-head">
        <h2>Create an attestation</h2>
      </div>
      <p className="muted">
        Load the witness file exported from SoundingBoard. It never leaves this page —
        the proof is generated on your own machine, against your own proof server.
      </p>

      <label className="dropzone">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
        />
        <span>{loaded ? `Loaded ${loaded.name}` : "Choose a witness file (.json)"}</span>
      </label>

      {error && <p className="error">{error}</p>}

      {loaded && (
        <>
          <div className="split">
            <div className="pane private">
              <h3>Stays on your device</h3>
              <ul>
                <li>
                  Device secret <span className="mono">{short(loaded.file.secretKey)}</span>
                </li>
                <li>
                  {real} session commitment{real === 1 ? "" : "s"}, each a 32-byte hash
                </li>
                <li>
                  {loaded.file.commitments.filter((c) => c === ZERO_COMMITMENT).length} padding
                  slot(s), so the vector width reveals nothing
                </li>
              </ul>
              <p className="fine">
                These are witness values. They are consumed inside the proof and are not
                part of the transaction.
              </p>
            </div>
            <div className="pane public">
              <h3>Becomes public</h3>
              <ul>
                <li>A hash derived from your device secret</li>
                <li>
                  The number <strong>{claimed}</strong>
                </li>
              </ul>
              <p className="fine">
                That pair is the receipt. Not which sessions, not when, not how they went,
                not how many you actually have.
              </p>
            </div>
          </div>

          <div className="claim">
            <label htmlFor="claimed">
              Attest to <strong>{claimed}</strong> of {real} completed session
              {real === 1 ? "" : "s"}
            </label>
            <input
              id="claimed"
              type="range"
              min={1}
              max={Math.max(real, 1)}
              value={claimed}
              onChange={(e) => setClaimed(Number(e.target.value))}
            />
            <p className="fine">
              You may attest to fewer sessions than you hold — the circuit allows it, and a
              later attestation can raise the number. It can never lower it.
            </p>
            {claimError && <p className="error">{claimError}</p>}
          </div>

          <div className="submit-row">
            <button className="primary" disabled>
              Connect wallet &amp; submit
            </button>
            <p className="fine">
              Browser submission needs the Lace extension pointed at Preview. The same
              proof-and-submit flow runs headlessly today — see{" "}
              <span className="mono">npm run attest -w sb-phase0-smoke</span>, which is
              what produced the entries above.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

export function App() {
  return (
    <main>
      <header className="masthead">
        <div>
          <h1>Practice Proof</h1>
          <p className="tagline">
            Prove you did the rehearsal. Reveal nothing about it.
          </p>
        </div>
        <span className="badge">{DEPLOYMENT.network}</span>
      </header>

      <p className="lede">
        SoundingBoard keeps every practice conversation on your device. That makes it
        private, and it also makes it unprovable — if a coach, a course, or an employer
        asks whether you did the work, the only evidence is your diary. This contract
        replaces the diary with a receipt.
      </p>

      <PublicRecord />
      <WitnessInspector />

      <footer>
        <dl>
          <div>
            <dt>Contract</dt>
            <dd className="mono">{CONTRACT_ADDRESS}</dd>
          </div>
          <div>
            <dt>Deployed in block</dt>
            <dd>{DEPLOYMENT.blockHeight}</dd>
          </div>
          <div>
            <dt>Proof server</dt>
            <dd className="mono">{PROOF_SERVER} (local — witnesses never leave it)</dd>
          </div>
        </dl>
        <p className="fine">
          <a href={EXPLORER} target="_blank" rel="noreferrer">
            Midnight Preview explorer
          </a>
          {" · "}
          Practice, not therapy. SoundingBoard is a communication rehearsal tool.
        </p>
      </footer>
    </main>
  );
}
