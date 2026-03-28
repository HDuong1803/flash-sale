# Tech Stack Policy

Selection decisions only. Setup/tutorial steps belong in `.claude/templates/docs/technical/STACK_SETUP.md`.

## Approved Stack (Current Monorepo)

| Layer | Approved choices | Notes |
|-------|------------------|-------|
| Monorepo package manager | pnpm | Use pnpm in both apps; do not mix npm/yarn in CI scripts |
| Frontend app | Next.js 16 + React 19 + TypeScript | App Router architecture in `flashsale-frontend/` |
| Frontend UI | Tailwind CSS + shadcn/ui | Existing design system direction |
| Backend app | NestJS 10 + TypeScript | API in `flashsale-backend/` |
| Database | PostgreSQL + Prisma 6 | Primary relational store |
| Cache | Redis | Caching + distributed coordination |
| Queue / broker | RabbitMQ (amqplib) + Bull where already present | Do not force major queue migration without ADR |
| Auth | JWT + Passport + bcrypt | Existing backend implementation |
| Validation | class-validator / class-transformer + Joi where already used | Keep current mixed pattern unless migration task is approved |
| Logging | Pino (and existing observability wiring) | Keep structured logs |
| Error monitoring | Sentry (frontend + backend) | Already configured in repo |
| Containers | Docker + docker-compose | Existing local/prod compose flows |

## Compatibility Policy

1. Preserve current stable architecture by default.
2. Prefer incremental adaptation over stack rewrites.
3. Any change that replaces core runtime tooling (framework, ORM, broker, validation model) requires an ADR in `docs/technical/DECISIONS.md`.

## Queue Policy

| Need | Preferred path |
|------|----------------|
| Existing flow already implemented with RabbitMQ | Keep RabbitMQ |
| Existing flow already implemented with Bull | Keep Bull for that scope |
| New async flow | Choose RabbitMQ for cross-service events; Bull for local background jobs, document decision in ADR if uncertain |

## Banned Without ADR

| Technology / Change | Reason |
|---------------------|--------|
| Switching NestJS backend to another framework | High migration risk, broad surface area |
| Replacing Prisma as primary ORM in one shot | High schema/runtime risk |
| Replacing RabbitMQ/Bull system-wide in one release | Operational and delivery risk |
| Introducing a second frontend framework in same app | Maintenance and DX fragmentation |

All banned items can be approved only via explicit human request + ADR.
