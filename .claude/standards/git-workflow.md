# Git Workflow Standard

## Branch Strategy (Git Flow)

| Branch | Purpose | Created from | Merges into |
|--------|---------|-------------|-------------|
| `main` | Production-ready code | — | — |
| `develop` | Integration branch | `main` | `main` (release) |
| `staging` | Pre-production stabilization | `develop` | `main` |
| `feature/*` | New features | `develop` | `develop` |
| `fix/*` | Bug fixes | `develop` | `develop` |
| `hotfix/*` | Critical production fixes | `main` | `main` + `develop` |
| `release/*` | Release preparation | `develop` | `main` + `develop` |

## Branch Naming

```
feature/<ticket-id>-short-description
fix/<ticket-id>-short-description
hotfix/<ticket-id>-short-description
release/v<semver>
chore/<description>
docs/<description>
```

Examples:
```
feature/TASK-042-user-auth
fix/TASK-091-null-email-crash
hotfix/TASK-099-payment-double-charge
release/v1.3.0
```

## Commit Message Format (Conventional Commits)

```
<type>(<scope>): <short description>

[optional body — explain WHY, not WHAT]

[optional footer — Closes #issue, BREAKING CHANGE: description]
```

**Types**:
- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting (no logic change)
- `refactor` — restructure without behavior change
- `test` — add or update tests
- `chore` — tooling, dependencies, config
- `perf` — performance improvement
- `ci` — CI/CD pipeline changes

**Scope**: the module or area affected (`auth`, `api`, `db`, `ui`, `infra`)

**Short description**: present tense, lowercase, no period, max 72 characters

```
feat(auth): add JWT refresh token rotation
fix(api): return 404 when user not found instead of 500
test(auth): add regression test for expired token edge case
chore(deps): upgrade prisma to 5.8.0
```

## Commit Best Practices

- One logical change per commit — do not bundle unrelated changes
- Stage specific files: `git add src/auth/` not `git add -A`
- Commits must be clean with project-real commands (pnpm):
	- `cd flashsale-backend && pnpm lint && pnpm test`
	- `cd flashsale-frontend && pnpm lint`
- Never commit secrets, `.env`, or generated files

## Pull Request Requirements

- Title: Conventional Commits format
- Fill out `PULL_REQUEST_TEMPLATE.md` completely
- Link to related issue: `Closes #XXX`
- At least one reviewer required before merge
- All CI checks must pass
- No direct commits to `main` or `develop`

## Tag & Release

```bash
# Semantic versioning: MAJOR.MINOR.PATCH
git tag -a v1.3.0 -m "Release v1.3.0 — user authentication feature"
git push origin v1.3.0
```

- `MAJOR`: breaking changes
- `MINOR`: new features, backward-compatible
- `PATCH`: bug fixes, backward-compatible

## Merge vs Rebase

- Feature branches: squash merge into `develop` (one clean commit per feature)
- Hotfix branches: merge commit (preserves emergency context)
- Never rebase branches that others have checked out
