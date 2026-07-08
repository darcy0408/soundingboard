---
description: Start a work session — load project state, review the last session's handoff, propose today's plan
---

You are opening a new work session in this repository. Get fully oriented before doing anything else, then hand the user a short, decision-ready briefing.

Do these in order:

1. **Project rules**: Read `CLAUDE.md` and, if it exists, `SPEC.md` (or the project's equivalent authoritative spec). Treat them as binding for everything this session.
2. **Last session's handoff**: Read `SESSION_NOTES.md` if it exists — the most recent entry is the handoff from `/close-session`. If it doesn't exist, say so and reconstruct context from git history instead.
3. **Repo state**: Run `git status` and `git log --oneline -10`. Flag anything unexpected: uncommitted changes, untracked files that look like real work, a branch other than the default.
4. **Health check**: If the project has cheap verification (typecheck, lint, unit tests — check package.json scripts), run the fastest one per workspace. Don't run anything slow or networked.
5. **Sync**: If a remote exists, `git fetch` and note whether local is behind.

Then give the briefing — keep it tight:
- **Where things stand**: one or two sentences on project phase and what the last session accomplished.
- **Anything broken or dirty**: uncommitted work, failing checks, unpushed commits. If everything is clean, say exactly that in one line.
- **Open items**: next steps and blockers carried over from the last handoff, distinguishing "blocked on the user" items (logins, keys, purchases, physical-device tests) from work you can do.
- **Proposed focus**: your recommendation for what this session should tackle, as a short ordered list.

End by asking the user to confirm the focus or redirect. Do not start implementing until they answer.
