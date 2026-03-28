# /orchestrate — Multi-Agent Task Coordinator

**Precedence**: Tier 2. This workflow's constraints override individual agent behavior.

**Constraint**: The orchestrator never writes code, schema, copy, or configuration.
It coordinates, sequences, validates, and reports. Violating this creates coupling
between coordination logic and implementation logic — do not do it.

---

## Inputs

- `$ARGUMENTS` — the task description from the user
- Current state of: `CLAUDE.md`, `docs/technical/DECISIONS.md`, `docs/technical/ARCHITECTURE.md`, `TODO.md`, `PRD.md`

## Outputs

- Consolidated report: files modified, open items, risks, next steps
- Updated `TODO.md` (via project-manager)
- Local commits per agent (orchestrator pushes branch and opens PR at end)

---

## Phase 1 — Ground Yourself

### 1a — Bootstrap Check (run first)

Before reading any project docs, check which runtime files exist:

```
Required: PRD.md, TODO.md, docs/technical/ARCHITECTURE.md,
          docs/technical/DECISIONS.md, docs/technical/API.md,
          docs/technical/DATABASE.md
```

If **any required file is missing**:

1. Do not proceed to Phase 2
2. Identify which files are missing
3. For each missing file, copy the corresponding template from `.claude/templates/`:
   - Missing `PRD.md` → copy `.claude/templates/PRD.md` to `PRD.md`
   - Missing `TODO.md` → invoke `project-manager` to create it with empty sections
   - Missing `docs/technical/*.md` → copy from `.claude/templates/docs/technical/`
4. Also ensure `.tasks/TASK_TEMPLATE.md` exists by copying `.claude/templates/.tasks/TASK_TEMPLATE.md` if missing.
5. Report: "Bootstrap: created [list of files] from templates. These need to be filled in before full orchestration is useful."
6. Ask: "Continue with the task now, or stop here to fill in the bootstrapped files first?"
7. If the user chooses to continue, note that responses will be based on empty templates.

### 1b — Read Project State

After bootstrap check passes (all files exist), read in this order:

1. `CLAUDE.md` — active agents, critical rules, project context
2. `.claude/core/operating-model.md` — precedence, ownership, failure handling
3. `docs/technical/DECISIONS.md` — prior architectural decisions (do not contradict them)
4. `docs/technical/ARCHITECTURE.md` — current system shape
5. `TODO.md` — current backlog state
6. `PRD.md` — product requirements (read-only, source of truth)

Use real workspace commands and package manager from this repo:
- Backend: run commands in `flashsale-backend/` via `pnpm`
- Frontend: run commands in `flashsale-frontend/` via `pnpm`
- Do not use `npm` or `yarn` commands unless explicitly requested by human

Do not proceed to Phase 2 until all six are read.

---

## Phase 2 — Task Decomposition

Analyze `$ARGUMENTS`:

1. What is the concrete deliverable?
2. Which specialist agents are required?
3. What are the subtasks, inputs, and outputs per agent?
4. Which documents will each agent read vs write?

Check: does any subtask require modifying `PRD.md`?
- If yes: **halt**. Surface to user: "This task requires changing PRD.md, which requires explicit human approval. Please confirm."
- If no: proceed to Phase 3.

---

## Phase 3 — Dependency Analysis

For each subtask, determine:

**Hard sequential dependencies** (B cannot start until A finishes):
- Schema migrations must complete before application code that uses new columns
- Architecture decision (systems-architect) must complete before implementation begins
- API contract (backend-developer) must be finalized before frontend integration starts

**Parallel-safe combinations** (can run in same wave):
- Frontend and backend tasks that operate on independent endpoints
- Documentation updates and test writing for completed features
- Docker and CI/CD configuration changes

**Judgment calls** (flag for user confirmation if uncertain):
- Tasks that modify shared configuration files
- Tasks that touch the same source files from different agents

---

## Phase 4 — Wave Plan + Confirmation Gate

Present the execution plan before any agent is launched:

```
Execution Plan for: [task description]

Wave 1 (sequential — architecture gate):
  - systems-architect: [specific deliverable]

Wave 2 (parallel — implementation):
  - backend-developer: [specific deliverable]
  - database-expert: [specific deliverable]

Wave 3 (parallel — integration):
  - frontend-developer: [specific deliverable]
  - qa-engineer: [specific deliverable]

Wave 4 (sequential — documentation):
  - documentation-writer: [specific deliverable]

Dependency rationale:
  - Wave 1 before Wave 2: architecture decision required before implementation
  - Wave 2 before Wave 3: API contract required before frontend integration

Estimated files modified: [list]
PRD.md modifications: None required
```

Ask: "Proceed with this plan? (yes / modify / cancel)"

Do not proceed until the human confirms.

---

## Phase 5 — Backlog Registration

Invoke `project-manager` to register each subtask in `TODO.md` with:
- task title
- assigned agent
- blocked_by dependencies

---

## Phase 5b — Feature Branch

Create feature branch before any implementation begins:

```
git checkout -b feature/[short-slug-from-task-description]
```

Naming follows `standards/git-workflow.md` branch conventions.

---

## Phase 6 — Execution Tracking

Create a TodoWrite item for each agent task. Format:

```
[ ] [agent-name]: [deliverable description]
```

Mark `in_progress` when wave starts. Mark `completed` when agent confirms done.

---

## Phase 7 — Execute Wave by Wave

For each wave:

1. Build the agent prompt. Include:
   - Specific deliverable
   - Files to read
   - Files to write (agent must own them — see `core/operating-model.md`)
   - Relevant standards (from agent's `## Active Standards`)
   - Done criteria

2. Launch agents in the wave

3. Collect output. Before applying:
   - **PRD mutation check**: scan proposed file modifications. If `PRD.md` is in the list → halt wave, alert user: "Agent [X] proposed changes to PRD.md (read-only). Review before proceeding."
   - **Ownership check**: verify each modified file is owned by the writing agent (see `core/operating-model.md` ownership table). If not → reject and re-route to correct agent.
   - **Conflict check**: if agent output contradicts an existing ADR in `DECISIONS.md` → halt and surface conflict before applying.

4. On wave failure:
   - Halt remaining waves
   - Report: what succeeded, what failed, what was not started
   - Ask for resolution decision before continuing

5. Post-feature verification gate (mandatory for frontend/backend features):
   - If any completed wave changed frontend and/or backend feature behavior, invoke `qa-engineer` to run Playwright MCP verification.
   - Require a verification report containing:
     - flow-level PASS/FAIL summary
     - screenshots for critical flow steps
     - error logs for failed steps
   - Persist report using `docs/qa/PLAYWRIGHT_MCP_VERIFICATION_TEMPLATE.md` format.
   - If verification result is FAIL:
     - do not mark feature complete
     - add follow-up fix task in `TODO.md`
     - halt before Phase 8 until human confirms next action

6. Verification completion rule:
   - A frontend/backend feature is considered complete only when Playwright MCP result is PASS.
   - If Playwright MCP is unavailable in the runtime environment, report `BLOCKED` (not PASS) and ask human whether to run verification in a compatible environment.

---

## Phase 8 — Synthesis

Present consolidated report:

```
## Orchestration Complete

### Completed
- [agent]: [deliverable] → [files modified]

### Open Items
- [issue or follow-up required]

### Risks Introduced
- [any new technical debt, deferred decisions, or known gaps]

### Next Steps
- [recommended actions]

### Playwright MCP Verification
- Result: PASS | FAIL
- Verified flows: [list]
- Screenshots: [artifact refs]
- Error logs: [artifact refs or inline summary]

### Branch
- feature/[slug] — ready to push and open PR
```

Ask: "Push branch and open PR? (yes / no)"
If yes: `git push -u origin feature/[slug]` then `gh pr create` with summary.

---

## Orchestrator Invariants

These are non-negotiable. No exception without human instruction.

- Never write implementation code
- Never skip Phase 4 confirmation gate
- Never proceed past a wave failure without human resolution
- Never apply output that modifies `PRD.md` without explicit human approval
- Never skip the PRD mutation check in Phase 7
- Never push to `main` or `master` directly
