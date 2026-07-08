---
description: End a work session — verify, commit, write the handoff to SESSION_NOTES.md, push
---

You are closing out this work session. The goal: nothing in flight is lost, the repo is left in a state a fresh session (or a different model) can pick up cold, and the user gets an honest summary.

Do these in order:

1. **Verify before committing**: run the project's cheap checks (typecheck / lint / unit tests — check package.json scripts) for any workspace touched this session. If something fails, tell the user and ask whether to fix now or commit as work-in-progress with the failure noted — never silently commit red.
2. **Commit**: `git status`; if there are uncommitted changes, group them into one or more coherent commits with messages that describe *what and why*, not "wip". If the working tree is clean, say so and skip.
3. **Write the handoff**: append an entry to `SESSION_NOTES.md` in the repo root (create it with a `# Session notes` heading if missing; newest entry at the top, directly under the heading). Format:

   ```
   ## YYYY-MM-DD — <one-line session summary>
   **Done:** what was actually completed and verified (bullet list; note verification level — "tests pass", "typecheck only", "unverified").
   **Decisions:** choices made this session and the one-line why, especially anything that overrides or extends the spec.
   **Next:** the ordered next steps for the following session.
   **Blocked on user:** anything only the user can do (logins, secrets, purchases, device tests). Omit if none.
   **Risks/unverified:** known weak spots a future session should not assume are solid. Omit if none.
   ```

   Write it for a reader with zero context from this session: no shorthand, no unexplained codenames, spell out file paths.
4. **Commit the notes** (separate small commit is fine), then **push** if a remote is configured. If the push fails or there is no remote, say so explicitly — don't let the user believe work is backed up when it isn't.
5. **Report back**: a short closing summary — what was committed (with hashes), whether it's pushed, and the top item for next time. If anything was left dirty, red, or unpushed, lead with that.
