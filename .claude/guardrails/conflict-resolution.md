# Conflict Resolution

When two instructions conflict, apply this procedure in order.

---

## Step 1 — Check Tier

Apply the precedence hierarchy from `core/operating-model.md`:

```
Tier 1: core/operating-model.md
Tier 2: workflows/orchestrate.md
Tier 3: agents/*.md
Tier 4: standards/*.md
```

The higher tier wins. Stop here if tiers differ.

---

## Step 2 — Same-Tier Conflicts

When two instructions at the same tier conflict, apply these tiebreakers in order:

**2a. Specificity wins over generality**

The more specific instruction takes precedence.

```
Conflict:
  standards/security.md: "Use bcrypt for password hashing"
  standards/code-standards.md: "Follow library defaults"

Resolution: security.md is more specific about password hashing → security.md wins
```

**2b. Prohibition wins over permission**

A "never do X" beats a "you may do X".

```
Conflict:
  agents/backend-developer.md: "You may use raw SQL for complex reports"
  standards/database.md: "Never use raw SQL — always use ORM or query builder"

Resolution: database.md prohibits raw SQL → database.md wins
```

**2c. Safety wins over speed**

Instructions that protect correctness, security, or data integrity win over
instructions that optimize for speed or convenience.

```
Conflict:
  workflows/orchestrate.md: "Execute waves in parallel where possible"
  agents/database-expert.md: "Schema migrations must run sequentially, never in parallel"

Resolution: sequential migration is a safety constraint → database-expert wins
```

**2d. If still unresolved — halt and ask the human**

Do not guess. Do not pick arbitrarily. Surface the conflict explicitly:

```
Conflict detected:
  File A says: [exact quote]
  File B says: [exact quote]
  Tiebreaker rules 2a–2c do not resolve this.
  Please instruct which takes precedence before I continue.
```

---

## Known Conflicts and Resolutions

Document resolved conflicts here to avoid re-litigating them.
Each entry quotes the exact conflicting text so resolutions remain interpretable.

| ID | Files in conflict | File A says | File B says | Resolution | Date |
|----|-------------------|-----------|-----------|----|------|
| CR-001 | `standards/database.md` vs `agents/backend-developer.md` | "Never use raw SQL string concatenation — always use ORM or parameterized queries" | (no raw SQL allowance in current file — no conflict exists) | No conflict. Both files require ORM or parameterized queries. Raw query builders (Knex `.raw()`, Prisma `$queryRaw`) are ORM-layer tools, not raw SQL. | 2026-03-28 |
| CR-002 | `workflows/orchestrate.md` vs `agents/database-expert.md` | "Parallel-safe combinations: Frontend and backend tasks that operate on independent endpoints" | "Schema migrations must complete before application code that uses new columns" | Migrations always execute in their own wave (Wave 1 or dedicated wave) before any application code wave. Orchestrator must never place a migration and application code in the same parallel wave. | 2026-03-28 |

---

## Anti-Patterns to Avoid

**Do not resolve by merging contradictory rules.**

Wrong:
> "Use bcrypt normally, but raw SHA-256 is acceptable for low-risk cases."

This creates a new, ambiguous rule. Either the prohibition stands or it has an explicit,
human-approved exception. There is no middle ground.

**Do not silently choose the more convenient option.**

If a strict rule requires more work, apply it. Convenience is not a tiebreaker.

**Do not apply a conflict resolution from a past conversation to a new one.**

Conflict resolutions in the table above are permanent. Ad-hoc resolutions from
conversation history are not — re-surface if the conflict appears again.
