# Product Requirements Document

**READ-ONLY — Human edits only. No agent may modify this file without explicit human instruction in the current conversation.**

**Version**: 0.1
**Status**: Draft
**Last updated by**: [Name] on [YYYY-MM-DD]

---

## Executive Summary

[2–3 sentences: what the product does, who it serves, and the primary value proposition.]

---

## Problem Statement

### Current Situation
[Describe the status quo — what does the user do today without this product?]

### The Problem
[What specific pain does this product solve? Be concrete: time wasted, money lost, error rate, etc.]

### Why Now
[What makes this the right time to build this? Market, technology, or team factors.]

---

## Goals & Success Metrics

### Business Goals
1. [Goal — verb + measurable outcome]
2. [Goal]

### Success Metrics

| Metric | Baseline | Target | Timeframe |
|--------|---------|--------|-----------|
| [e.g., Monthly Active Users] | [current] | [target] | [e.g., 6 months post-launch] |
| [e.g., Task completion rate] | [current] | [target] | [timeframe] |

---

## User Personas

### Persona 1: [Name]

| Field | Value |
|-------|-------|
| Role | [job title or description] |
| Goals | [what they are trying to accomplish] |
| Pain points | [what frustrates them today] |
| Technical level | [non-technical / moderate / technical] |
| Usage frequency | [daily / weekly / occasional] |

### Persona 2: [Name]

| Field | Value |
|-------|-------|
| Role | |
| Goals | |
| Pain points | |
| Technical level | |
| Usage frequency | |

---

## Functional Requirements

### FR-001: [Feature Name]
**Priority**: Must-have / Should-have / Nice-to-have
**Persona**: [which persona this serves]

[Description of what the system must do. Focus on behavior, not implementation.]

Acceptance criteria:
- [ ] [Specific, testable condition]
- [ ] [Specific, testable condition]

### FR-002: [Feature Name]
[Repeat pattern]

---

## Non-Functional Requirements

### Performance
- Page load: LCP < 2.5s on a 4G connection
- API response: p99 < 500ms under expected load
- Uptime: 99.9% monthly

### Security
- Authentication required for all user data access
- OWASP Top 10 compliance (see `standards/security.md`)
- Data encrypted in transit (TLS 1.2+) and at rest

### Scalability
- Initial target: [N] concurrent users
- Growth assumption: [X]x over [N] months

### Accessibility
- WCAG 2.1 Level AA for all user-facing interfaces

### Browser / Platform Support
- Web: latest 2 versions of Chrome, Firefox, Safari, Edge
- Mobile: iOS 16+, Android 10+ (if applicable)

---

## Out of Scope

The following are explicitly excluded from this version. Adding them requires human approval:

- [Item 1]
- [Item 2]

---

## Open Questions

Questions that are unresolved and require input before implementation:

| # | Question | Owner | Due |
|---|---------|-------|-----|
| 1 | [Question] | [Name] | [Date] |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | [YYYY-MM-DD] | [Name] | Initial draft |
