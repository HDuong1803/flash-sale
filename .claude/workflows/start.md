# /start — Project Onboarding Protocol

Execute these steps in sequence. Do not skip steps or proceed past a failure.

---

## Step 1 — Validate Project Context

Read `CLAUDE.md`. Check for the literal string `[Project Name]` or `[2–3 sentences` in the file.

If found:
> "Project context is not configured. Before we can proceed, please:
> 1. Replace `[Project Name]` with your actual project name
> 2. Fill in the Project Context section (2–3 sentences: what it does, who it serves, core problem)
> 3. Update the tech stack summary line
>
> Run `/start` again after updating."

**Stop here if context is unfilled.**

---

## Step 2 — Load and Summarize Requirements

Read `PRD.md`. If it does not exist:

1. Copy `.claude/templates/PRD.md` to `PRD.md` in the project root
2. Report: "PRD.md was missing — created from template at `PRD.md`. Fill in the product requirements before running `/orchestrate`."
3. Continue to Step 3 (do not stop — the remaining steps are still useful).

If it exists, summarize:
- Top 3 user personas (one sentence each)
- Primary success metric
- Top 3 functional requirements

Present summary. Ask: "Does this match your current product direction? (yes / needs update)"

If "needs update": the human must edit `PRD.md` directly (agents cannot). Re-run `/start` after.

---

## Step 3 — Check Backlog State

Read `TODO.md`. If it is empty or missing:

Invoke `project-manager` with:
> "Initialize TODO.md for this project. Create three sections: 'In Progress', 'Backlog', 'Completed'.
> Add one initial task: 'Initial project setup' in Backlog with priority High."

---

## Step 4 — Validate Documentation State

Check that these files exist:

- `docs/technical/ARCHITECTURE.md`
- `docs/technical/DECISIONS.md`
- `docs/technical/API.md`
- `docs/technical/DATABASE.md`
- `.tasks/TASK_TEMPLATE.md`

For each missing file, report it. Offer:
> "These runtime files are missing: [list]
> Run `/orchestrate 'initialize missing documentation files'` to create them from templates.
> Or proceed without them if this is a very early-stage project."

---

## Step 5 — Present Launchpad

Display:

```
Project: [Project Name]
Stack: [from CLAUDE.md]

Available workflows:
  /orchestrate [task]  — coordinate multi-agent execution
  /review [scope]      — code review with severity levels
  /fix-issue [issue]   — systematic bug resolution
  /sync-template       — pull upstream template improvements

Available specialists:
  project-manager · systems-architect · backend-developer
  frontend-developer · react-native-developer · database-expert
  qa-engineer · ui-ux-designer · documentation-writer
  cicd-engineer · docker-expert · copywriter-seo

Backlog: [N] items in TODO.md

What would you like to work on?
```
