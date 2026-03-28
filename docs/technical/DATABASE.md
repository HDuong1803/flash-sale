# Database Reference

**Owner**: @database-expert
**Engine**: PostgreSQL 16
**ORM**: Prisma 6.x
**Connection**: `DATABASE_URL` environment variable
**Last updated**: 2026-03-28

---

## Schema Overview

TODO(fill-with-project-context): extract canonical table/entity list from `flashsale-backend/prisma/schema.prisma` and map to module ownership.

```
[ASCII ERD]

users
  id (PK)
  email (unique)
  ──┐
    │ 1:many
    ▼
sessions
  id (PK)
  user_id (FK → users.id)
```

---

## Tables

### users

**Purpose**: Core user accounts and credentials.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `email` | VARCHAR(320) | NOT NULL, UNIQUE | Lowercased at write time |
| `password_hash` | VARCHAR(60) | NOT NULL | bcrypt, 12 rounds |
| `name` | VARCHAR(100) | NOT NULL | Display name |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | Updated by trigger |
| `deleted_at` | TIMESTAMPTZ | NULL | Soft delete |

**Indexes**:
- `idx_users_email` on `(email)` WHERE `deleted_at IS NULL`

**Notes**:
- Soft deletes: filter `WHERE deleted_at IS NULL` in all application queries
- `updated_at` managed by Prisma middleware or database trigger

---

### sessions

**Purpose**: Refresh token storage for JWT auth.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | |
| `user_id` | UUID | NOT NULL, FK → users.id ON DELETE CASCADE | |
| `token_hash` | VARCHAR(64) | NOT NULL, UNIQUE | SHA-256 of refresh token |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 7 days from creation |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT now() | |

**Indexes**:
- `idx_sessions_user_id` on `(user_id)`
- `idx_sessions_expires_at` on `(expires_at)` — used for cleanup jobs

**Notes**:
- Token stored as hash; original token sent to client only
- Expired sessions cleaned up by a daily cron job

---

## Migrations Log

| Migration | Date | Description | Risk |
|-----------|------|-------------|------|
| `20240115120000_initial_schema` | 2024-01-15 | Initial tables | Zero-downtime |

---

## Query Patterns

### Fetch user by email (auth)

```sql
SELECT id, email, password_hash, name
FROM users
WHERE email = $1
  AND deleted_at IS NULL;
```

### Validate session

```sql
SELECT s.id, s.user_id, s.expires_at, u.email, u.name
FROM sessions s
JOIN users u ON u.id = s.user_id
WHERE s.token_hash = $1
  AND s.expires_at > NOW()
  AND u.deleted_at IS NULL;
```

---

## Known Issues & Tech Debt

| Issue | Impact | Planned fix |
|-------|--------|-------------|
| [Description] | [High/Medium/Low] | [Date or backlogged] |
