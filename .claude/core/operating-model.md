# Operating Model

This file governs how the entire `.claude/` system behaves. It has the highest precedence.
When any other file conflicts with this document, this document wins.

---

## Precedence Hierarchy

This is the canonical precedence table. `CLAUDE.md` and all other files defer to this.

```
Tier 1 — core/operating-model.md          (this file — highest authority)
Tier 2 — workflows/*.md                    (all workflow commands)
Tier 3 — agents/*.md                       (specialist behavior)
Tier 4 — standards/*.md                    (technical rules — lowest authority)
```

**Conflict resolution**: when instructions at different tiers conflict, the higher tier prevails.
When instructions at the same tier conflict, invoke `guardrails/conflict-resolution.md`.

**Higher tiers may summarize lower-tier rules** for readability (e.g., CLAUDE.md listing
"run tests before marking complete" as a reminder of `standards/testing.md`). A summary in
a higher-tier file does not create a duplicate — it is a pointer. A semantic contradiction
(higher tier says DO X, lower tier says DO NOT X) is a real conflict and must be resolved.

---

## Document Ownership Model

Each document in `docs/` has exactly one **write owner**. Only the owner may apply changes.
Contributor agents produce section patches and route them to the owner for application.

| Document | Write Owner | Section Contributors (propose patches to owner) |
|----------|-------------|------------------------------------------------|
| `docs/technical/ARCHITECTURE.md` | `systems-architect` | `frontend-developer` (Frontend section), `ui-ux-designer` (Design system section), `cicd-engineer` (CI/CD section), `docker-expert` (Infrastructure section), `qa-engineer` (Test strategy section) |
| `docs/technical/DECISIONS.md` | `systems-architect` | none |
| `docs/technical/API.md` | `backend-developer` | none |
| `docs/technical/DATABASE.md` | `database-expert` | none |
| `docs/user/USER_GUIDE.md` | `documentation-writer` | none |
| `docs/content/CONTENT_STRATEGY.md` | `copywriter-seo` | none |
| `docs/qa/PLAYWRIGHT_MCP_VERIFICATION_TEMPLATE.md` | `qa-engineer` | none |
| `docs/ai-sales-advisor-plan.md` | `systems-architect` | `backend-developer` (backend integration notes), `frontend-developer` (frontend integration notes), `qa-engineer` (verification notes) |
| `TODO.md` | `project-manager` | **sole writer**; other agents report task status to orchestrator who relays to project-manager |
| `PRD.md` | **human only** | all agents read-only without exception |
| `.tasks/*.md` | `project-manager` | executing agent updates only the `status`, `started_at`, `completed_at` fields |

**Section contributor protocol**: a contributor agent produces its section content as output.
The orchestrator routes this output to `systems-architect`, who applies it to `ARCHITECTURE.md`.
Contributors never write directly to `ARCHITECTURE.md`.

**Violation**: if an agent proposes writing to a document it does not own (and is not the
designated contributor for its section), reject the output and re-route to the correct owner.

---

## Standards Scoping Rules

Standards in `standards/` are NOT loaded globally. Each agent declares which standards
it uses via the `## Active Standards` section in its agent file. An agent is bound only
by its declared standards, not by the full `standards/` directory.

This prevents a `copywriter-seo` agent from being constrained by database naming conventions,
and prevents context window pollution from irrelevant technical rules.

---

## Workflow Authority Matrix

Each workflow has defined authority and mutation rights.

| Workflow | Authority | May Mutate |
|---------|-----------|-----------|
| `orchestrate` | Tier 2. Coordinates all agents. Can launch waves, sequence agents, push branches, open PRs. | `TODO.md` (via project-manager), `.tasks/*.md` (via project-manager), feature branches, agent task outputs |
| `start` | Tier 2. Validates project state. Can initialize missing files from templates. | Bootstrap runtime docs from `.claude/templates/` when missing, and may invoke project-manager to create `TODO.md`. |
| `review` | Tier 2. Read-only analysis. Reports findings, does not apply changes. | Nothing. Output is findings only. |
| `fix-issue` | Tier 2. Implements one targeted fix. | Source files within the fix scope, test files, `TODO.md` via project-manager |
| `sync-template` | Tier 2. Upstream sync only. | `.claude/` directory files only. Never `PRD.md`, `TODO.md`, `docs/`, source code. |

**Multi-agent constraint**: only `orchestrate` may launch multiple agents in sequence or parallel.
Other workflows invoke at most one specialist agent per session.

Individual agents launched outside of orchestration have no authority over other agents.

---

## Protected Files

The following files should not be modified during normal feature work. They are only edited
for explicit `.claude` governance integration or human-requested policy updates.

The files below must never be modified by any agent without explicit human instruction
in the current conversation. Attempting to modify them triggers a halt and user prompt.

- `PRD.md`
- `.claude/core/operating-model.md` (this file)
- `.claude/guardrails/conflict-resolution.md`
- `.claude/guardrails/prompt-lint-rules.md`
- Any file inside `.claude/templates/` (these are upstream-synced)

---

## Agent Naming Convention

All agent files must follow: `[role]-[qualifier].md`

Examples: `backend-developer.md`, `qa-engineer.md`, `react-native-developer.md`

Agents referenced in `workflows/orchestrate.md` must exactly match filenames in `agents/`.
A mismatch causes silent delegation failure. Run `guardrails/prompt-lint-rules.md` checks
before adding or renaming agents.

---

## Task Lifecycle

```
todo → in_progress → completed
           ↓
         blocked (add blocked_by field, notify project-manager)
```

- Agents set status to `in_progress` when starting a task
- Agents set status to `completed` only after tests pass and docs are updated
- Agents must never self-assign tasks outside their domain
- Blocked tasks must surface to the orchestrator, not silently stall

---

## Failure Handling

When an agent encounters a blocking error:
1. Do not retry the same action more than once
2. Do not silently continue with a degraded approach
3. Surface the blocker explicitly: "Blocked: [reason]. Proposed path: [option A] or [option B]."
4. Halt and wait for human instruction

When the orchestrator encounters a wave failure:
1. Halt execution of remaining waves
2. Present what succeeded, what failed, and what was not started
3. Ask the human for a resolution decision before continuing
