# /review — Code Review

**Input**: `$ARGUMENTS` — file path, PR number, or feature scope to review.

**Output**: structured findings with severity levels, blocking issues, and patch plan.

---

## Constraints

- Never modify files during review — output findings only
- Flag blocking issues before non-blocking ones
- Reference the specific standard violated for each finding

---

## Phase 1 — Map Scope

Identify impacted layers from `$ARGUMENTS`:

- Database schema changes → involve `database-expert` standards
- API endpoints → check against `standards/api-conventions.md`
- Auth logic → check against `standards/security.md`
- New features → verify test coverage against `standards/testing.md`
- `.claude/` file changes → **run `guardrails/prompt-lint-rules.md` full checklist (L1–L10) first**

Read `docs/technical/DECISIONS.md` — flag any code that contradicts a prior ADR.

If `.claude/` files are in the review scope and any lint check fails, report the LINT FAIL
immediately (using the format in `guardrails/prompt-lint-rules.md`) before continuing with
other findings. Lint failures are blocking.

---

## Phase 2 — Route to Specialist Reviewers

For each impacted layer, apply the relevant standard:

| Layer | Standard |
|-------|---------|
| All code | `standards/code-standards.md` |
| API design | `standards/api-conventions.md` |
| Error handling | `standards/error-handling.md` |
| Auth / data handling | `standards/security.md` |
| Database queries | `standards/database.md` |
| Test coverage | `standards/testing.md` |
| Observability | `standards/monitoring.md` |
| Git / commits | `standards/git-workflow.md` |

---

## Phase 3 — Aggregate Findings

Classify each finding:

**Critical** — must fix before merge; will cause production failure, data loss, or security breach

**Warning** — should fix before merge; degrades reliability or maintainability

**Suggestion** — optional improvement; does not block merge

**Good** — call out what is done well; reinforce positive patterns

---

## Output Format

```
## Review: [scope]

### Critical (must fix before merge)
- [file:line] [description] — violates [standard/rule]
  Fix: [specific action]

### Major (should fix before merge when feasible)
- [file:line] [description]
  Fix: [specific action]

### Minor (optional / follow-up)
- [file:line] [description]

### Good
- [what was done well]

### ADR Conflicts
- [any code contradicting DECISIONS.md — must surface to systems-architect]

### Verdict
[ ] BLOCK — critical issues must be resolved first
[ ] APPROVE WITH MAJORS/MINORS — merge acceptable, track follow-ups in TODO.md
[ ] APPROVE — no significant issues
```
