# Testing Standard

## Requirements

- 80% line coverage minimum for new code
- Every new feature has tests before the task is marked complete
- Every bug fix has a regression test
- Tests pass in CI before merge — no exceptions
- Every completed frontend/backend feature must be verified with Playwright MCP before marking the task complete

Current repo reality:
- Backend has Jest unit/e2e setup and should be treated as mandatory quality gate.
- Frontend currently has lint/build but no standardized automated test suite yet.
- Until frontend test framework is added, Playwright MCP verification is mandatory for user-flow changes.

## Playwright MCP Verification Gate

Apply this gate after implementation is done for any feature that touches frontend and/or backend:

1. Execute end-to-end flow verification using Playwright MCP against the feature scope.
2. Capture screenshots for each critical step in the verified flow.
3. Capture error logs for any failed step (console errors, network failures, uncaught exceptions).
4. Publish a verification report in the task output.

Required report format:

```markdown
## Playwright MCP Verification Report

Feature: [feature name]
Scope: [frontend | backend | full flow]
Result: PASS | FAIL

### Verified Flows
- [flow name] — PASS | FAIL
- [flow name] — PASS | FAIL

### Screenshots
- [step name]: [path or artifact reference]

### Error Logs
- [timestamp] [error source] [error message]

### Notes
- [blocking issue or follow-up]
```

If Result is FAIL, the feature is not complete and cannot be moved to done/completed.

Use `docs/qa/PLAYWRIGHT_MCP_VERIFICATION_TEMPLATE.md` as canonical template.

## Testing Pyramid

```
         E2E (Playwright MCP)
        Integration (API / module boundaries)
       Unit (service/domain logic)
```

## File Organization

```
Backend (`flashsale-backend/`)
- Unit: `src/**/*.spec.ts` (Jest unit project)
- E2E: `test/**/*.ts` (Jest e2e project)

Frontend (`flashsale-frontend/`)
- Add tests in a conventional location when framework is introduced (for example `src/**/*.test.ts(x)`)
- Until then, rely on lint/build + Playwright MCP verification for changed user flows
```

## Test Naming

```typescript
describe('[ClassName or module]', () => {
  describe('[method or scenario]', () => {
    it('[should] [expected behavior] [when condition]', () => { ... });
    it('should not [reproduce bug] when [condition]', () => { ... }); // regression
  });
});
```

## Coverage Configuration

```typescript
Backend uses Jest coverage (`pnpm test` / `pnpm test:unit`).
Frontend coverage threshold should be defined once frontend test runner is added.
```

## Test Data

- Use factory functions — never hardcoded fixture files for tests that mutate state
- Each test creates its own data; tests must not depend on execution order
- Test databases: use a dedicated test database, never the development or production database
- Clean up: truncate tables in `beforeEach` or use transactions that roll back

## What to Test

**Unit tests**: business logic in service layer — edge cases, error paths, state transitions.
Not: implementation details, framework internals, private methods directly.

**Integration tests**: API contracts — correct status codes, response envelope structure,
auth enforcement, error responses. Use a real database with test data.

**E2E tests**: critical user flows — happy paths and key error paths. Not every edge case
(that is unit test territory). Use `data-testid` selectors.

## What Not to Test

- Functions that are just wrappers around framework/library calls
- Internal private implementation details (test the observable behavior, not the how)
- Generated code (ORM model types, protobuf, OpenAPI client)
- Configuration files

## CI Requirements

```yaml
# All must pass before merge
- cd flashsale-backend && pnpm lint
- cd flashsale-backend && pnpm test
- cd flashsale-backend && pnpm test:e2e
- cd flashsale-frontend && pnpm lint
- cd flashsale-frontend && pnpm build

For frontend/backend user-flow changes, attach Playwright MCP verification report (PASS required).
```

A failing test is a blocking issue — do not merge with skipped or commented-out tests.
