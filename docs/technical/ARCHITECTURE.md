# System Architecture

**Owner**: @systems-architect
**Last updated**: [YYYY-MM-DD]

---

## Overview

[2–3 sentences describing the system at a high level.]

TODO(fill-with-project-context):
- Monorepo has `flashsale-frontend` (Next.js 16) and `flashsale-backend` (NestJS 10).
- Backend serves REST APIs under `/api/v1` with Prisma + PostgreSQL.
- Frontend consumes backend APIs and implements role-based flows for Customer/Merchant/Admin.

```
[ASCII architecture diagram]

  Browser/Mobile
       │
       ▼
  [CDN / Load Balancer]
       │
       ▼
  [Application Server]
  ├── API Layer
  ├── Auth Middleware
  └── Background Workers
       │
       ▼
  [PostgreSQL] [Redis] [Object Storage]
```

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend | Next.js | 16.x | App Router, Server Components |
| Mobile | N/A (current repo) | — | React Native agent currently inactive |
| Backend | NestJS | 10.x | TypeScript strict |
| Database | PostgreSQL | 16 | Primary data store |
| ORM | Prisma | 6.x | |
| Cache | Redis | 7 | Sessions, coordination |
| Job queue / broker | RabbitMQ + Bull (existing) | mixed | Keep existing flows, avoid forced rewrite |
| Hosting | [Provider] | — | |

---

## System Components

### Frontend Architecture

[Owned by @frontend-developer — update this section when component architecture changes]

**Rendering strategy**:
- Server Components: [describe which pages use SSR]
- Client Components: [describe which components require browser APIs or interactivity]

**State management**:
- Server state: [React Query / SWR]
- Global UI state: [Zustand — describe slices]
- Form state: React Hook Form

**Key component groups**:
- [Component group]: [purpose]

---

### Backend Architecture

**Layer responsibilities**:

```
Route         → path, method, middleware composition
Controller    → parse request, delegate to service, format response
Service       → business logic, orchestrate repositories
Repository    → data access only
Database      → PostgreSQL via Prisma
```

**Key services**:
- [ServiceName]: [responsibility]

---

### Infrastructure

[Owned by @cicd-engineer and @docker-expert]

- **Environments**: development, staging, production
- **Deployment**: [CI/CD tool and strategy]
- **Containerization**: Docker + docker-compose (development), [orchestration in production]

---

## Data Flow

### [Flow Name — e.g., User Authentication]

1. [Step: who does what]
2. [Step]
3. [Step]

---

## Design System

[Owned by @ui-ux-designer — update when design tokens or component patterns change]

### Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `primary-500` | `#3b82f6` | Primary actions |
| `neutral-900` | `#0f172a` | Body text |
| `error` | `#dc2626` | Error states |

### Typography Scale

| Token | Size / Line Height | Usage |
|-------|-------------------|-------|
| `text-sm` | 14px / 20px | Labels, captions |
| `text-base` | 16px / 24px | Body |
| `text-lg` | 18px / 28px | Subheadings |
| `text-2xl` | 24px / 32px | Section headings |

### Component Inventory

| Component | Location | Status |
|-----------|---------|--------|
| Button | `src/components/ui/Button.tsx` | Stable |
| Input | `src/components/ui/Input.tsx` | Stable |

---

## Security Architecture

- Authentication: JWT (15m access) + refresh token (7d, stored in DB for revocation)
- Authorization: role-based + row-level ownership checks
- Transport: TLS 1.2+ everywhere
- Secrets: environment variables only (see `standards/security.md`)

---

## Performance Considerations

- [Known bottleneck]: [mitigation]
- Database: connection pool max [N], indexes on [columns]
- Caching: [what is cached, TTL strategy]

---

## Known Constraints & Technical Debt

| Item | Impact | Owner | Planned resolution |
|------|--------|-------|-------------------|
| [Description] | [High/Medium/Low] | [@agent] | [Date or "backlogged"] |

---

## Mobile Architecture

[Owned by @react-native-developer — update when mobile architecture changes]

**Expo workflow**: Managed / Bare
**Navigation**: React Navigation [version], [navigator types used]
**State management**: [describe approach]
