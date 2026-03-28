# /fix-issue — Bug Resolution Workflow

**Input**: `$ARGUMENTS` — issue number, description, or error message.

**Output**: root cause analysis, fix implementation, regression test, commit.

---

## Constraints

- Fix the root cause, not the symptom
- Do not refactor surrounding code beyond what the fix requires
- Regression test is mandatory before marking complete
- If `$ARGUMENTS` includes an issue number, commit message must reference it; otherwise use standard `fix(scope): description` format without `Closes #`.

---

## Phase 1 — Understand the Issue

1. Read `$ARGUMENTS` in full
2. If an issue number is provided, read the full issue description
3. Reproduce the failure mentally: what state + input produces the bad output?
4. Check `docs/technical/DECISIONS.md` — is this a known limitation or deferred decision?

---

## Phase 2 — Root Cause Analysis

Trace the execution path:

1. Identify entry point (route, event, cron, user action)
2. Follow through layers (controller → service → repository → database)
3. Identify the layer where the invariant breaks
4. Ask: is this a logic error, a missing guard, a race condition, or a missing validation?

Do not write code until root cause is confirmed.
State the root cause explicitly: "Root cause: [X] because [Y]."

---

## Phase 3 — Plan the Fix

Before implementing:

1. Will the fix change the API contract? → route through `backend-developer` + update `docs/technical/API.md`
2. Will the fix change the database schema? → route through `database-expert` + migration required
3. Will the fix change authentication logic? → apply `standards/security.md` OWASP checklist
4. Is the fix contained to one layer? → implement directly

State the fix plan: "Fix plan: [specific change at specific location]."

---

## Phase 4 — Implement

Apply the minimum change needed. Follow:

- `standards/error-handling.md` for error cases
- `standards/code-standards.md` for style
- No unrelated refactoring

---

## Phase 5 — Write Regression Test

Write a test that:
- Fails before the fix
- Passes after the fix
- Lives in the appropriate test location for this repo:
  - Backend: `flashsale-backend/src/**/*.spec.ts` or `flashsale-backend/test/**/*.ts`
  - Frontend: nearest existing test directory/pattern in `flashsale-frontend/` (if absent, create minimal test scaffold)

Test name format: `should not [reproduce the bug] when [condition]`

---

## Phase 6 — Verify

Run the full test suite. Confirm:
- Regression test passes
- No previously passing tests now fail
- If applicable, run repo-real commands with `pnpm`:
  - Backend: `cd flashsale-backend && pnpm lint && pnpm test`
  - Frontend: `cd flashsale-frontend && pnpm lint` (+ test command if configured)

---

## Phase 7 — Commit

Stage only the files changed by this fix — never `git add -A`:

```bash
git add [specific files changed by this fix]
```

Compose commit message based on input type:

- If `$ARGUMENTS` contained an issue number (e.g., `#42`, `TASK-042`):
  ```bash
  git commit -m "fix([scope]): [description]

  Closes #[issue-number]"
  ```

- If `$ARGUMENTS` was a free-form error message or description (no issue number):
  ```bash
  git commit -m "fix([scope]): [description]"
  ```

Do not fabricate an issue number. Do not add `Closes #` if no issue was referenced.

Report: "Fixed. Root cause was [X]. Change is in [files]. Regression test added at [path]."
