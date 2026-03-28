# Prompt Lint Rules

Run these checks before adding, renaming, or merging any `.claude/` files.
Each check has a pass/fail criterion. A single FAIL blocks the change.

---

## L1 — Agent File Naming

**Rule**: all files in `agents/` must follow `[role]-[qualifier].md`.

**Check**: list `agents/*.md` filenames. Each must match `^[a-z]+-[a-z]+(-[a-z]+)?\.md$`.

**Fail examples**: `frontend.md`, `QA.md`, `backend_dev.md`

**Pass examples**: `frontend-developer.md`, `qa-engineer.md`, `react-native-developer.md`

---

## L2 — Orchestrator Agent Reference Integrity

**Rule**: every agent name referenced in `workflows/orchestrate.md` must have a corresponding
file in `agents/`.

**Check**:
1. Extract all agent names from `workflows/orchestrate.md` (look for `agents/` references and agent invocation strings)
2. For each name, verify `agents/[name].md` exists
3. FAIL if any reference is dangling

**Common failure**: renaming an agent file without updating the orchestrator.

---

## L3 — Active Standards Declared

**Rule**: every file in `agents/` must contain an `## Active Standards` section listing at
least one file from `standards/`.

**Check**: for each `agents/*.md`, grep for `## Active Standards`. FAIL if absent or empty.

---

## L4 — Document Ownership Coverage

**Rule**: every document in the ownership table in `core/operating-model.md` that has a named
owner agent (not "human only") must have exactly one `agents/*.md` file that declares it under
`## Documents Owned`. Section contributors declare under `## Section Contributions`, not
`## Documents Owned`.

**Check**:
1. Read the ownership table in `core/operating-model.md`
2. For each row where Owner ≠ "human only":
   - Count how many `agents/*.md` files list the document under `## Documents Owned`
   - FAIL if count ≠ 1
3. For `ARCHITECTURE.md`: exactly one agent declares it under `## Documents Owned`
   (`systems-architect`); all others must declare it under `## Section Contributions`.
   FAIL if any contributor lists `ARCHITECTURE.md` under `## Documents Owned`.

---

## L5 — No Semantic Drift Between Tiers

**Rule**: a rule that appears at multiple tier levels must not contradict itself across tiers.
Summaries and reminders at higher tiers are allowed and expected (see `core/operating-model.md`
Precedence section). What is not allowed: a higher-tier file saying DO X while a lower-tier
file says DO NOT X, with no explicit resolution.

**Check**: search for directive stems that carry a clear polarity across tiers:

- Higher tier says "never [X]" while lower tier says "[X] is acceptable" → FAIL
- Higher tier says "always [X]" while lower tier says "avoid [X]" → FAIL
- Higher tier summarizes "run tests before marking complete" while lower tier has the full
  testing standard → PASS (summary, not contradiction)

**PASS examples** (summaries at higher tier are fine):
- `CLAUDE.md` says "Never hardcode secrets" as a reminder; `standards/security.md` has the full rule → allowed
- `CLAUDE.md` says "Conventional Commits on all commits"; `standards/git-workflow.md` has full spec → allowed

**FAIL examples** (semantic contradictions):
- `agents/backend-developer.md` says "raw SQL allowed for reports"; `standards/database.md` says "never raw SQL" → FAIL
- `workflows/orchestrate.md` says "skip confirmation for small tasks"; its own invariants say "never skip Phase 4 gate" → FAIL

---

## L6 — No Broken File References

**Rule**: every `@reference`, `See [file]`, or `standards/[file].md` mention must point to
a file that exists.

**Check**: extract all file path strings matching `standards/`, `templates/`, `agents/`,
`workflows/`, `core/`, `docs/`. Verify each exists on disk. FAIL on first missing target.

---

## L7 — PRD Protection

**Rule**: no `agents/*.md` or `workflows/*.md` file may contain an instruction that grants
permission to write to `PRD.md`.

**Check**: grep all `agents/` and `workflows/` files for:
- `edit PRD`
- `write to PRD`
- `modify PRD`
- `update PRD`

FAIL if any match is found that is not inside a prohibition statement.

---

## L8 — No Stack Selection Decisions in Agent Files

**Rule**: agent files must not make technology *selection* decisions (choosing one tool over
another). Selection decisions belong in `standards/tech-stack-policy.md` or `CLAUDE.md`.
Agent files may and should contain usage patterns, configuration examples, and anti-patterns
for the project's chosen tools.

**The distinction**:
- Selection decision (FAIL in agent files): "Use Prisma over Sequelize because..."
- Usage pattern (PASS in agent files): Tailwind config example, Playwright Page Object pattern,
  Expo workflow configuration, Docker multi-stage build structure — these are *how to use*
  the already-selected tool, not *which tool to select*

**Check**: grep `agents/*.md` for language that frames a choice between competing tools:
- "use [X] over [Y]"
- "prefer [X] to [Y]"
- "choose [X] because"
- "avoid [X], use [Y] instead"

Each match is a selection decision and belongs in `standards/tech-stack-policy.md`.

Usage pattern examples and configuration code in agent files are not violations.

---

## L9 — Template Files Unmodified

**Rule**: files inside `.claude/templates/` are synced from upstream and must not be edited
locally. Local customizations belong in project-level `docs/` files.

**Check**: `git diff HEAD -- .claude/templates/` must be empty.
If local modifications exist, they must be explicitly acknowledged and copied to
the appropriate project-level document before `sync-template` is run.

---

## L10 — No Tutorial Content in Standards

**Rule**: files in `standards/` must contain rules, constraints, and illustrative examples
only. The following content types are banned from `standards/` and belong in
`templates/docs/technical/STACK_SETUP.md`:

- `npm install` / `yarn add` commands
- Full library initialization sequences (e.g., `npx prisma init`, `npx playwright install`)
- Step-by-step setup procedures ordered for a first-time developer
- Boilerplate scaffold files intended to be copied verbatim into a new project

**PASS examples** in standards (rule illustrations):
- A short code block showing the correct `asyncHandler` pattern (rule illustration)
- A SQL example showing parameterized query vs string concatenation (anti-pattern contrast)
- A Jest test skeleton showing naming convention (format reference)

**FAIL examples** in standards (tutorials):
- Full Express app bootstrap sequence (`app.use(helmet())`, `app.listen(...)`, etc.)
- Full `docker-compose.yml` scaffold
- `npm install [15 packages]` command

**Check**: grep `standards/*.md` for lines containing `npm install`, `npx`, `yarn add`.
Each match is a FAIL. Also flag code blocks that appear to be complete bootstrapping sequences
(multiple sequential setup steps) rather than targeted rule illustrations.

---

## Running the Lint Checklist

**When to run**: before any `.claude/` commit, and as part of `sync-template` Step 6
and `review` Phase 2 when `.claude/` files are in scope.

**How to invoke**: when any workflow reaches a lint gate, work through this checklist
sequentially. A single FAIL must be reported before the workflow continues.

```
[ ] L1  — agent filenames follow role-qualifier.md pattern
[ ] L2  — all orchestrator agent references resolve to existing files
[ ] L3  — all agent files have ## Active Standards section
[ ] L4  — document ownership table has exactly one owner per document
[ ] L5  — no semantic drift (contradictions) between tier levels
[ ] L6  — no broken file references
[ ] L7  — no agent grants permission to write PRD.md
[ ] L8  — no stack selection decisions in agent files (usage patterns are fine)
[ ] L9  — templates/ directory has no local modifications
[ ] L10 — standards/ contains no npm install / npx / yarn add commands or bootstrap sequences
```

Report format on failure:

```
LINT FAIL — [L#]: [brief description]
File: [path]
Line: [approximate location]
Rule: [exact rule text from above]
Fix: [specific action required]
```
