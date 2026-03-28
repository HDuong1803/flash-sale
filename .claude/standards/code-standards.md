# Code Standards

Merged from: clean-code rules + code style + naming conventions.
This single file replaces all three.

## Formatting

- Preserve each package's existing formatter/linter settings (do not mass-reformat unrelated files)
- Keep style consistent within edited file/module
- Prefer automated lint/format commands from the package being changed

## Naming

| Construct | Convention | Example |
|-----------|-----------|---------|
| Variables, functions | camelCase | `getUserById`, `isActive` |
| Classes, interfaces, types | PascalCase | `UserRepository`, `AppError` |
| Constants (module-level) | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT`, `DEFAULT_PAGE_SIZE` |
| Files (source) | kebab-case | `user-repository.ts`, `auth-middleware.ts` |
| Folders | kebab-case, plural | `controllers/`, `repositories/` |
| Environment variables | UPPER_SNAKE_CASE | `DATABASE_URL`, `JWT_SECRET` |
| Database tables | snake_case, plural | `user_sessions`, `refresh_tokens` |
| Database columns | snake_case | `created_at`, `user_id` |
| Cache keys | `namespace:resource:id` | `cache:user:123`, `cache:user:123:profile` |
| Queue/event names | `[service].[entity].[action]` | `email.user.welcome`, `order.payment.failed` |
| Test files | `[name].test.ts` | `user-service.test.ts` |
| E2E test files | `[name].spec.ts` | `auth.spec.ts` |

## Variables

- `const` by default; `let` only when reassignment is required
- Meaningful names: `isUserEligible` not `flag`, `userCount` not `n`
- Explanatory variables for complex expressions:
  ```typescript
  // bad
  if (user.age >= 18 && user.subscription === 'pro' && !user.isBanned) { }

  // good
  const isEligible = user.age >= 18 && user.subscription === 'pro' && !user.isBanned;
  if (isEligible) { }
  ```
- Searchable names: avoid single-character variables except loop indices (`i`, `j`)

## Functions

- Prefer options object when parameter list becomes hard to read
- Prefer small single-purpose functions; extract when complexity grows
- One responsibility: a function does one thing
- No flag parameters — split into two named functions
- No side effects on external state unless the function name makes it explicit
- `async/await` over raw Promises

```typescript
// bad — flag parameter
function createUser(data: CreateUserDto, sendEmail: boolean) { }

// good — two explicit functions
function createUser(data: CreateUserDto) { }
function createUserAndSendWelcomeEmail(data: CreateUserDto) { }
```

## Classes

- Prefer composition over inheritance
- SOLID: each class has one reason to change
- Method chaining returns `this` for fluent builder patterns

## TypeScript

- Respect current `tsconfig` strictness per package and do not weaken it
- No `any` without a comment explaining why it is unavoidable
- No `// @ts-ignore` without a comment and a TODO to fix
- Export types explicitly — do not rely on inference for public API shapes
- Prefer `interface` for object shapes, `type` for unions/intersections

## Imports

Order (enforced by ESLint):
1. Node built-ins (`fs`, `path`, `crypto`)
2. External packages (`express`, `zod`, `prisma`)
3. Internal absolute imports (`src/`)
4. Relative imports (`./`, `../`)

Blank line between each group.

## Comments

- Comments explain WHY, not WHAT
- No commented-out code committed — delete it or track in `TODO.md`
- No journal comments (`// John - 2024-01-15: fixed the bug`) — git log is the journal
- No position markers (`// ===== SECTION =====`)
- JSDoc on public functions with non-obvious parameters

## File Organization

```
[imports]
[types/interfaces]
[constants]
[main export — class or functions]
[private helpers]
```

## Async Error Handling

Handle async errors explicitly at the right boundary (service/controller/filter). Avoid silent promise rejections:

```typescript
// bad
async function doWork() {
  const result = await riskyOperation(); // unhandled rejection if it throws
}

// good
async function doWork() {
  try {
    const result = await riskyOperation();
    return result;
  } catch (err) {
    throw new AppError('Operation failed', 500, 'WORK_FAILED');
  }
}
```
