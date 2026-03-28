# Architecture Decision Records

**Owner**: @systems-architect
**Last updated**: [YYYY-MM-DD]

Consult this document before proposing any change that affects system structure,
technology selection, or cross-service contracts. Do not contradict an Accepted ADR
without first proposing a superseding ADR.

---

## Decision Index

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| ADR-001 | Integrate class-ai-agent as governance baseline | Accepted | 2026-03-28 |
| ADR-002 | Minimal-change adaptation to existing backend/frontend stack | Accepted | 2026-03-28 |

---

## ADR-001: Integrate class-ai-agent as governance baseline

**Status**: Accepted
**Date**: 2026-03-28
**Author**: @systems-architect

### Context

Monorepo lacked a unified AI operating model across backend/frontend workstreams. Without a shared governance layer, prompt rules, ownership boundaries, and workflow quality gates drift over time.

### Options Considered

#### Option A: Integrate full template as-is

- Pros: Fast rollout
- Cons: Mismatch with current stack/scripts/docs maturity

#### Option B: Minimal-change integration with soft adaptation

- Pros: Fits current monorepo reality, avoids disruptive rewrites
- Cons: Requires targeted edits to workflows/standards

### Decision

Chosen option: Option B. We preserve governance intent while adapting commands, ownership, and standards to actual repo constraints.

### Consequences

- Easier: consistent execution and auditable AI workflow behavior
- Harder: maintaining divergence from upstream template over time
- Follow-up required: periodic `/sync-template` with compatibility review

---

## ADR-002: Minimal-change adaptation to existing backend/frontend stack

**Status**: Accepted
**Date**: 2026-03-28
**Author**: @systems-architect

### Context

Current apps are stable on Next.js 16 + NestJS 10 + Prisma + Redis + RabbitMQ/Bull mix. A forced stack normalization (for example replacing queue/validation approach) would create broad regression risk.

### Options Considered

#### Option A: Force standards to idealized stack
- Pros: conceptual consistency
- Cons: high migration effort and delivery risk

#### Option B: Keep existing stack and constrain future drift via standards
- Pros: safe rollout, practical adoption
- Cons: standards must tolerate mixed patterns in short term

### Decision

Choose Option B. Preserve current architecture; require ADR for any major stack replacement.

### Consequences

- Easier: teams can adopt governance immediately
- Harder: some standards become policy-based instead of strict single-tool mandates
- Follow-up required: define phased modernization tasks in TODO backlog

---

## ADR Template

Copy this when adding a new ADR. Increment the number.

```markdown
## ADR-NNN: [Decision Title]

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Date**: YYYY-MM-DD
**Author**: @systems-architect

### Context
[Why this decision must be made now.]

### Options Considered

#### Option A: [Name]
- Pros: ...
- Cons: ...

#### Option B: [Name]
- Pros: ...
- Cons: ...

### Decision
[Chosen option and reason.]

### Consequences
- Easier: ...
- Harder: ...
- Follow-up required: ...
```
