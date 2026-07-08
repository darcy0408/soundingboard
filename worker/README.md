# soundingboard-api (Cloudflare Worker)

Thin-Worker backend for SoundingBoard (see repo root `CLAUDE.md` / `SPEC.md`).
Holds `ANTHROPIC_API_KEY` and `CARTESIA_API_KEY` as Worker secrets, forwards
requests to `claude-haiku-4-5` and Cartesia TTS, never ships keys in the app
bundle or the repo.

## Layout

```
worker/
  src/
    index.ts               Hono app, route wiring, CORS
    types.ts                Shared request/response/Env types
    prompts.generated.ts     GENERATED — do not edit by hand (see below)
    promptAssembly.ts        Placeholder substitution, reminder injection, transcript formatting
    anthropicClient.ts       @anthropic-ai/sdk wrapper (turn + feedback calls)
    crisis.ts                Crisis keyword pre-filter + fixed response
    rateLimit.ts              Per-device KV rate limiting (40/hr, 400 or 1200/day)
    cartesia.ts               Cartesia TTS config + request builder
    routes/
      turn.ts POST /v1/turn
      feedback.ts POST /v1/feedback
      tts.ts POST /v1/tts
  scripts/
    extract-prompts.mjs       Generates prompts.generated.ts from ../prompts/*.md
    persona-stress-test.ts    SPEC.md §10 kill-criterion gate (needs ANTHROPIC_API_KEY)
  test/                       vitest — no network, Anthropic client mocked
  wrangler.toml
  package.json
```

## Prompt single-sourcing

`prompts/persona-system.md`, `prompts/vent-coach.md`, and `prompts/feedback.md`
(repo root) are owned by the planning model. `npm run generate-prompts` (also
wired as `prebuild`/`predeploy`) parses those files and writes
`src/prompts.generated.ts` — verbatim extraction, never rewording. The
generated file is checked in so the Worker has no runtime dependency on the
`prompts/` directory. Re-run the script after any prompt-file change:

```
npm run generate-prompts
```

The script fails loudly (non-zero exit) if a marker it expects
(`## PROMPT START`, the temperament/difficulty bullet sections, the
`persona_reminder` fenced block, the `FEEDBACK_SCHEMA` JSON block, or the
crisis SAFETY sentence) is missing or if the two prompt files' crisis
messages ever drift apart.

## Setup

```
npm install
```

## Local development

```
npm run dev
```

This regenerates prompts then runs `wrangler dev`. Without live secrets set
(see below), `/v1/turn` and `/v1/feedback` will fail once they try to call
Anthropic (401), and `/v1/tts` will correctly return `501 tts_unavailable`
until `CARTESIA_API_KEY` is set — the guard paths (missing `x-device-id`,
oversized content, rate limiting, crisis short-circuit) all work with no
secrets configured. Verified locally via `wrangler dev` + `curl` during
this change:

```
curl http://127.0.0.1:8787/
curl -X POST http://127.0.0.1:8787/v1/turn -H "content-type: application/json" -d '{}'
curl -X POST http://127.0.0.1:8787/v1/tts -H "content-type: application/json" \
  -d '{"text":"hi","temperament":"Dismissive"}'
```

## Tests & typecheck

```
npm run typecheck   # tsc --noEmit
npm test            # vitest run — Anthropic client is mocked, no network calls
```

## Deploying (commands Darcy needs to run)

```
# One-time: authenticate wrangler
npx wrangler login

# One-time: create the KV namespace for rate limiting, then paste the
# returned id into wrangler.toml's [[kv_namespaces]] `id` field (and the
# --preview id into `preview_id`)
npx wrangler kv namespace create RATE_LIMIT
npx wrangler kv namespace create RATE_LIMIT --preview

# One-time per environment: set secrets (never put these in wrangler.toml
# or any committed file)
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put CARTESIA_API_KEY

# Deploy (also regenerates prompts.generated.ts first, via predeploy)
npm run deploy
```

Before the first real deploy, tighten `ALLOWED_ORIGIN` in `wrangler.toml`
`[vars]` from `"*"` to the app's actual origin (SPEC.md §3: "CORS locked to
app").

## Endpoints (SPEC.md §3)

| Endpoint | Notes |
|---|---|
| `POST /v1/turn` | `{mode, persona, messages, turn_index}` → `{reply}`. Crisis pre-filter and rate limit run before any model call. Persona reminder is injected into the last user message every 8th turn (rehearse mode only). |
| `POST /v1/feedback` | `{persona, messages}` → parsed `FEEDBACK_SCHEMA` JSON, moments truncated to 3 defensively. |
| `POST /v1/tts` | `{text, temperament}` → `audio/mpeg` stream, or `501 {error:"tts_unavailable"}` if `CARTESIA_API_KEY` is unset (app should fall back to on-device TTS). |

## Rate limiting header contract

`x-device-id` (required) identifies the caller for the 40/hour, 400/day
(free) or 1200/day (entitled) counters in `RATE_LIMIT` KV. **Assumption,
flagged for the app team:** entitlement is asserted via an optional
`x-entitled: true` header, set by the app after its own RevenueCat
`CustomerInfo` check — SPEC.md §3 mentions the two-tier day limit but the
app doesn't do server-side receipt validation in v1 (no accounts, per the
cut list), so this is an anti-abuse throttle, not a billing control. If the
app team wants a different mechanism (e.g. a signed token from RevenueCat),
that's a small change in `routes/turn.ts`.

## Things NOT verified in this change

- **Cartesia API shape** (`src/cartesia.ts`): verified via web search against
  `docs.cartesia.ai/api-reference/tts/bytes` on 2026-07-08 (this postdates
  the implementing model's training cutoff, so it was not assumed from
  memory) — `POST https://api.cartesia.ai/tts/bytes`,
  `Cartesia-Version: 2026-03-01`, `model_id: "sonic-3.5"`,
  `voice: {mode: "id", id}}`, `output_format: {container: "mp3", ...}`.
  **Not exercised against a live Cartesia account** (no API key available
  in this environment) — re-verify the exact field names, the current
  `Cartesia-Version` date string, and the current `model_id` before the
  first real deploy.
- **Cartesia voice IDs**: `TEMPERAMENT_VOICE_IDS` in `src/cartesia.ts` are
  placeholder UUIDs (`00000000-...-0001` etc.), not real Cartesia voices —
  there's a `TODO` at that constant. Pick real voices from Cartesia's voice
  library before shipping.
- **@anthropic-ai/sdk on the Workers runtime**: the SDK's default transport
  is fetch-based and the plain `messages.create()` call used here should
  work without Node-only APIs, but this hasn't been exercised against a real
  Anthropic API key inside `wrangler dev` in this change (only the
  no-secrets guard paths were smoke-tested). If it turns out the SDK reaches
  for something Workers doesn't provide, the fallback is a hand-rolled
  `fetch()` against `https://api.anthropic.com/v1/messages`.
- **Structured outputs field name**: `output_config: {format: {type:
  "json_schema", schema}}` on `messages.create()` (no beta header) was
  confirmed against Anthropic's current API reference docs, not from the
  implementing model's training data — the installed `@anthropic-ai/sdk`
  version's TypeScript types may not yet have a typed `output_config` field
  on `MessageCreateParamsNonStreaming`, so `src/anthropicClient.ts` builds
  that request body as an untyped object and casts the response back to
  `Anthropic.Message`. `npm run typecheck` passes with this cast in place.
