# SoundingBoard: Conversation Practice

iOS app (Expo/React Native) for rehearsing difficult conversations with an AI persona that pushes back realistically, plus a vent-and-coach mode. One Cloudflare Worker backend, `claude-haiku-4-5` via the Anthropic API.

## Read first
- `SPEC.md` — the authoritative build spec: product flow, architecture, Worker endpoints, compliance rules, phase plan, cut list.
- `C:\dev\ideas\soundingboard-VALIDATION.md` — market research behind the decisions. Don't re-litigate positioning; it's evidence-based.

## Ground rules for implementing agents
- **Scope discipline:** build only what SPEC.md v1 defines. The cut list in SPEC.md §9 is binding — no real-time voice, accounts, AI memory, or extra features. (Android is in scope as of 2026-07-12 — see SPEC.md §9.)
- **Positioning is load-bearing:** this is *communication practice*, never therapy, emotional support, or an AI companion. The banned-words list in SPEC.md §5.3 applies to every string in the app and every line of store metadata.
- **The prompts are the product.** `prompts/persona-system.md`, `prompts/vent-coach.md`, `prompts/feedback.md` are owned by the planning model. Wire them in with placeholder substitution only — never edit, paraphrase, shorten, or "improve" their content.
- **No medical claims** anywhere. Use the disclaimer from SPEC.md §5.2 verbatim.
- **API keys live only in Cloudflare Worker secrets** (`ANTHROPIC_API_KEY`, `CARTESIA_API_KEY`). Never in the app bundle, never in the repo, never in wrangler.toml.
- **Model:** `claude-haiku-4-5` for every endpoint. Do not upgrade the model without planning-model sign-off (SPEC.md §10).
- Stack: Expo + TypeScript + Expo Router + Zustand; RevenueCat (`react-native-purchases`); Cloudflare Worker (`@anthropic-ai/sdk` + Hono); EAS Build (Windows dev machine — no local iOS builds, no Expo Go for STT features).
