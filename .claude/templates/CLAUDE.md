# [Project Name] — Claude Instructions

> Stack: [e.g., Next.js 14 · TypeScript · PostgreSQL · Prisma · Railway]
> Last updated: [YYYY-MM-DD]

## Project Context

[2–3 sentences: what this product does, who it serves, and the core problem it solves.]

**Tech stack summary**: [Frontend] · [Backend] · [Database] · [Hosting]

---

## Onboarding Checklist

Before using this project, verify these are filled in:

- [ ] `[Project Name]` replaced with actual project name (above)
- [ ] Project Context section filled in (2–3 sentences, not placeholder text)
- [ ] Tech stack summary updated
- [ ] `PRD.md` exists and has actual requirements
- [ ] `docs/technical/ARCHITECTURE.md` updated with actual system components

Run `/start` to validate project state interactively.

---

## Precedence Order

```
core/operating-model.md > workflows/ > agents/ > standards/
```

When instructions conflict, higher tier wins. See `core/operating-model.md`.

---

## Agents Available

**Mandatory delegation.** Every task within a specialist domain MUST be routed to
the appropriate agent. Do not implement code, design schemas, or configure pipelines
yourself — delegate. Handle directly only: routing decisions and tasks explicitly
outside all specialist domains.

| Agent | Role | Invoke when... |
|-------|------|----------------|
| `project-manager` | Backlog & coordination | Sprint planning, task breakdown, "What's next?" |
| `systems-architect` | Architecture & ADRs | New feature design, tech decisions, integration |
| `backend-developer` | API & business logic | Endpoints, auth, background jobs, integrations |
| `frontend-developer` | Web UI | Components, pages, client-side state, styling |
| `react-native-developer` | Mobile UI | React Native screens, navigation, native modules |
| `database-expert` | Schema & queries | Migrations, schema design, query optimization |
| `qa-engineer` | Testing | E2E tests, test strategy, coverage analysis |
| `ui-ux-designer` | UX & design system | User flows, wireframes, component specs, accessibility |
| `documentation-writer` | Living docs | User guide updates, post-feature documentation |
| `cicd-engineer` | CI/CD | Pipelines, deployments, branch protection |
| `docker-expert` | Containerization | Dockerfiles, docker-compose, image optimization |
| `copywriter-seo` | Copy & SEO | Landing page copy, meta tags, keyword strategy |

---

## Critical Rules

1. **PRD.md is read-only.** No agent modifies it without explicit human instruction.
2. **TODO.md is the living backlog.** Agents may add and complete items; never reorder.
3. **Conventional Commits** on all commits (see `standards/git-workflow.md`).
4. **Update docs** after every significant change before marking complete.
5. **Run tests** before marking any implementation task complete.
6. **No hardcoded secrets** in source code.
7. **Consult DECISIONS.md** before changes that may conflict with prior ADRs.
8. **Delegate to specialists.** The table above is binding.
9. **Commit locally; never push.** Orchestrator pushes and opens PRs.

---

## Project Structure

```
src/
  app/                  # Next.js App Router (or equivalent)
  components/           # Shared UI components
  lib/                  # Utilities and shared logic
tests/
  e2e/                  # Playwright E2E tests
  unit/                 # Vitest unit tests
docs/
  user/USER_GUIDE.md
  technical/            # ARCHITECTURE, API, DB, DECISIONS
  content/              # CONTENT_STRATEGY
.claude/
  core/                 # Governance (operating-model.md)
  workflows/            # Orchestration commands
  agents/               # Specialist agents
  standards/            # Technical rules (scoped per agent)
  guardrails/           # Conflict resolution + lint rules
  templates/            # Upstream-synced doc templates
.tasks/                 # Task files (owned by @project-manager)
```

---

## Key Documentation

@docs/technical/ARCHITECTURE.md
@docs/technical/DECISIONS.md
@docs/technical/API.md
@docs/technical/DATABASE.md
@docs/user/USER_GUIDE.md
