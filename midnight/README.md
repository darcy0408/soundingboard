# Midnight toolchain — Phase 0

Everything under `midnight/` was built during the MLH Midnight Hackathon
(Aug 28–30 2026). Nothing here existed before the event. See the root README's
prior-work disclosure for the full before/after split.

This file records what it actually takes to get a Midnight toolchain working on
a **Windows 11** machine, because several of the obvious paths are wrong.

## The short version

| Component | Version | Where it runs |
|---|---|---|
| Compact CLI (`compact`) | 0.5.2 | WSL2 Ubuntu 24.04 |
| Compact compiler | **0.31.1** (language 0.23.0) | WSL2 Ubuntu 24.04 |
| Node.js | 22.23.2 (nvm) | WSL2 Ubuntu 24.04 |
| Proof server | **8.1.0** | Docker Desktop (Linux engine) |
| Target network | **Preview** | `rpc.preview.midnight.network` |

## Four traps worth knowing about

### 1. `compact update` installs a compiler that is too new

`compact update` with no argument installs **0.34.0**, which targets **ledger 9**.
Preview, Preprod and Mainnet all still run **ledger 8**. The official 0.34.0
release notes say so directly: *"Ledger version 9 will be, but is not yet,
deployed on Midnight Mainnet. If you are building contracts to be deployed to
the current (as of Aug 18) Midnight Mainnet, you should continue to use Compact
toolchain 0.31.x."*

A contract built on 0.34.0 compiles perfectly and then fails on-chain, so this
is an expensive mistake to make late. Pin it explicitly:

```bash
compact update 0.31
```

The authoritative pin list is the docs
[compatibility matrix](https://docs.midnight.network/relnotes/support-matrix)
(Preview tab), which is what the versions in this repo follow:

| Component | Preview |
|---|---|
| Node (Midnight) | 1.0.1 |
| Compact toolchain | 0.31.1 |
| Compact runtime | 0.16.0 |
| Compact JS | 2.5.1 |
| On-chain runtime | 3.0.0 |
| Midnight.js | 4.1.1 |
| Indexer | 4.3.5 |
| Proof server | 8.1.0 |

### 2. On Windows, `compact` is already a system command

`C:\Windows\system32\compact.exe` is the NTFS file-compression tool. It shadows
the Midnight CLI on `PATH`, and it exits 0, so naive `compact --version` checks
report success while actually talking to the compression utility. (The
`midnight-tooling` doctor script false-positives on exactly this.)

The Midnight toolchain ships Linux/macOS binaries only, so it lives in **WSL**.
Do not try to install it into Git Bash. Everything in `phase0-smoke/` is run
from WSL:

```bash
wsl -d Ubuntu -- bash -c 'source ~/mnenv.sh; cd /mnt/c/dev/soundingboard/midnight/phase0-smoke; ...'
```

`~/mnenv.sh` (in the WSL home, not this repo) puts nvm's Node and
`~/.local/bin` ahead of the Windows interop `PATH`; without it, `npm` resolves
to the Windows `npm.cmd` and `node` is missing entirely. Ubuntu's `~/.bashrc`
returns early for non-interactive shells, so `bash -lc` alone will not load nvm.

### 3. There is no "testnet", and no "tDUST"

The public dev network is **Preview** (`rpc.preview.midnight.network`); the old
`testnet-02` naming is gone. Funding is also two steps, not one:

1. The faucet sends **tNIGHT** to the wallet's **unshielded** address
   (`mn_addr_preview1...`). Sending it to the shielded address does nothing.
2. **DUST** — which is what actually pays transaction fees — is *generated* by
   NIGHT that has been **registered** for DUST generation. Registration is
   self-funding (it pays its own fee out of the DUST the registered UTXOs
   generate), so it works at a zero DUST balance, but DUST still has to accrue
   before a deploy can pay for itself.

The faucet is a **browser form with no programmatic API**, so this step needs a
human: <https://faucet.preview.midnight.network/>

### 4. First wallet sync against Preview takes ~15 minutes

`waitForSyncedState()` walks ~164,000 indices at roughly 200/sec. It looks
hung. It isn't — `state.shielded.progress.appliedIndex` climbs steadily. Two
consequences baked into the scripts here:

- `scripts/address.ts` derives the funding address from the seed **without**
  building a `WalletFacade`, so you can start the faucet step immediately.
- `scripts/deploy.ts` does sync → DUST registration → deploy in a single run,
  so the 15-minute sync is paid once.

Also note `InMemoryTransactionHistoryStorage` means sync state is not persisted
between runs.

### 5. Two copies of the ledger wasm module (the expensive one)

`@midnight-ntwrk/midnight-js-protocol` pins `@midnight-ntwrk/ledger-v8` to
**exactly `8.1.0`**, while every `wallet-sdk-*` package asks for `^8.1.0`, which
resolves to `8.1.1`. npm satisfies both by installing *two* copies.

wasm-bindgen classes carry per-module identity, so a `LedgerParameters` built
from the hoisted 8.1.1 copy is rejected by the nested 8.1.0 copy:

```
Error: expected instance of LedgerParameters
  at Transaction.feesWithMargin (.../midnight-js-protocol/node_modules/@midnight-ntwrk/ledger-v8/...)
```

The error names a type, not a version, so it reads like a coding mistake. The
giveaway is the **nested** path in the stack trace. Fix by forcing one copy:

```json
"overrides": { "@midnight-ntwrk/ledger-v8": "8.1.0" }
```

Verify with `find node_modules -type d -name ledger-v8` — exactly one result.
Any project combining `midnight-js-*` with `wallet-sdk-*` needs this.

### 6. `setNetworkId()` is required, and fails late

midnight-js keeps the network id in module-global state. Forget it and
`deployContract` throws `Network ID has not been configured` *after* sync and
DUST are done. Call `setNetworkId('preview')` at module load.

### 7. `registerNightUtxosForDustGeneration` takes three arguments

The prose "handles signing internally; no separate signRecipe step" is true but
easy to misread — it signs internally *with a callback you supply*:

```typescript
const recipe = await wallet.registerNightUtxosForDustGeneration(
  utxos,
  keystore.getPublicKey(),
  (payload) => keystore.signData(payload),
);
const finalized = await wallet.finalizeRecipe(recipe);   // returns a RECIPE, not a tx
const txId = await wallet.submitTransaction(finalized);
```

Passing only `utxos` fails inside wasm as
`Cannot read properties of undefined (reading 'length')` in `addressFromKey`,
with no hint about arity.

## Phase 0 result — verified deploy

The compact-examples counter, compiled with 0.31.1 and deployed to Preview:

| | |
|---|---|
| Contract address | `e0e3fee37d7369c33f60824cd69a5316277c2b08f9177a016f8b9c93ee42bb78` |
| Block height | 621821 |
| Deploy tx (SDK `txId`) | `00f9859a67ea22672034ce124ebbb5d62e938624c4a2b5df04c75db95bb2ad816c` |
| Tx hash (indexer) | `c414c82ced2f1b709f2bc9559a933833014647a4864c16bf292bbe09bcbd4a46` |

The SDK's `txId` and the indexer's `transaction.hash` are different encodings of
the same transaction — don't expect them to match when cross-checking.

Independently confirmed on-chain, rather than trusting the deploy script:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"query":"{ contractAction(address: \"e0e3fee37d7369c33f60824cd69a5316277c2b08f9177a016f8b9c93ee42bb78\") { __typename address transaction { hash block { height } } } }"}' \
  https://indexer.preview.midnight.network/api/v3/graphql
# => {"contractAction":{"__typename":"ContractDeploy", ... "block":{"height":621821}}}
```

Measured timings on this machine, for planning Phase 2:

| Step | Time |
|---|---|
| First wallet sync (every run — not persisted) | ~13 min |
| DUST registration | seconds; fee of **1**, self-funding |
| DUST accrual after registration | effectively immediate |
| Deploy incl. proof generation | < 1 min |

The sync dominates. `InMemoryTransactionHistoryStorage` does not persist sync
state, so every process start pays it again — worth replacing with a persistent
store before Phase 2 iterates on deploys.

## Layout

```
midnight/
  README.md              this file
  phase0-smoke/
    contracts/           counter.compact + witnesses.ts (from compact-examples)
    scripts/
      address.ts         print the unshielded faucet address (instant)
      wallet.ts          create/sync a Preview wallet, show balances
      deploy.ts          sync -> register DUST -> deploy the counter
    build/               compiler output (gitignored)
```

## Reproducing Phase 0

```bash
# 1. Toolchain (WSL Ubuntu)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
compact update 0.31          # NOT bare `compact update`

# 2. Proof server (Docker Desktop running first)
docker run -d --name midnight-proof-server -p 6300:6300 \
  midnightntwrk/proof-server:8.1.0 -- midnight-proof-server -v
curl -sf http://localhost:6300/health

# 3. Compile the sample contract
cd midnight/phase0-smoke
compact compile contracts/counter.compact build/counter

# 4. Wallet + funding
npm install
npx tsx scripts/address.ts   # paste the address into the faucet
npx tsx scripts/deploy.ts    # sync, register DUST, deploy
```

## Wallet seed handling

**This repo is public** (a hackathon eligibility requirement), so the test
wallet seed is written outside the working tree, to
`~/.midnight-soundingboard/preview-wallet.json` in the WSL home, mode `0600`.
`phase0-smoke/.gitignore` also blocks `wallet.json` and `.wallet/` as a
second line of defence. It is a throwaway Preview wallet holding only test
tokens, but it should still never be committed.
