# /sync-template — Upstream Template Sync

Pulls `.claude/` improvements from the upstream template repository into this project.

---

## When to Run

- After the upstream template releases improvements to agent definitions or workflows
- When a new specialist agent is added upstream
- When `guardrails/` or `standards/` are updated upstream

---

## Step 1 — Fetch Upstream

```bash
git fetch upstream --no-tags
git diff HEAD upstream/main -- .claude/ > /tmp/template-diff.txt
```

If no `upstream` remote exists:
```bash
git remote add upstream [UPSTREAM_TEMPLATE_REPO_URL]
git fetch upstream --no-tags
```

---

## Step 2 — Show Diff Summary

Categorize changes before applying anything:

```
New files (will be added):
  [list of new files in upstream not present locally]

Modified files (upstream differs from local):
  [list with change summary]

Local-only files (not in upstream — will not be touched):
  [list]

LOCAL MODIFICATIONS WARNING:
  [list of files that exist both locally and in upstream AND have local changes]
  These will be overwritten. Confirm you have copied needed customizations to docs/.
```

Do not apply any changes until Step 3 confirmation.

---

## Step 3 — Confirm

Ask:
> "Ready to apply [N new, M modified] files from upstream template.
> Local-only files will be preserved.
> **Warning**: [X] locally modified template files will be overwritten (listed above).
>
> Proceed? (yes / show full diff / cancel)"

Do not apply without explicit "yes".

---

## Step 4 — Apply

Sync all `.claude/` subdirectories from upstream. This includes agents, workflows, core,
standards, guardrails, and templates. Project-level files are never touched.

```bash
# Sync all .claude/ subdirectories (never project-level files)
git checkout upstream/main -- .claude/core/
git checkout upstream/main -- .claude/workflows/
git checkout upstream/main -- .claude/agents/
git checkout upstream/main -- .claude/standards/
git checkout upstream/main -- .claude/guardrails/
git checkout upstream/main -- .claude/templates/
```

**Never sync** (preserve always):
- `CLAUDE.md` at project root — project-specific configuration
- `PRD.md`, `TODO.md`, `docs/` — project runtime state
- Source code, tests, configuration files

If the user confirmed only a partial sync (e.g., templates only) in Step 3, limit the
`git checkout` calls to only those subdirectories.

---

## Step 5 — Report

```
Sync complete.

Added: [N files]
Updated: [M files]
Preserved local-only: [K files]

Run /start to verify project state after sync.
```

---

## Step 6 — Cleanup

```bash
rm /tmp/template-diff.txt
```

Run `guardrails/prompt-lint-rules.md` L2 and L4 checks after sync to catch any
agent references that changed upstream.
