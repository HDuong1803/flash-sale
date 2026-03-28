# Database Standard

## Absolute Rules

- Never use raw SQL string concatenation — always use ORM or parameterized queries
- All database calls must be inside `try/catch`
- Multi-step operations that must be atomic require a transaction
- Select specific columns — never `SELECT *` in production queries
- All list queries must have `LIMIT` — never return unbounded result sets
- Sensitive data (passwords, tokens) must never be logged

## Query Patterns

```typescript
// Specific column selection
const user = await db('users')
  .select('id', 'email', 'name', 'created_at')
  .where({ id })
  .first();

// Paginated list
const users = await db('users')
  .select('id', 'email', 'name')
  .where({ is_active: true })
  .orderBy('created_at', 'desc')
  .limit(limit)
  .offset((page - 1) * limit);

// Transaction
await db.transaction(async (trx) => {
  const order = await trx('orders').insert(orderData).returning('*');
  await trx('inventory').where({ product_id: productId }).decrement('quantity', 1);
  await trx('order_items').insert(itemsData);
});
```

## Naming Conventions

| Object | Convention | Example |
|--------|-----------|---------|
| Tables | snake_case, plural | `user_sessions`, `refresh_tokens` |
| Columns | snake_case | `created_at`, `user_id`, `is_active` |
| Primary keys | `id` (UUID v4 or serial) | `id` |
| Foreign keys | `{table_singular}_id` | `user_id`, `order_id` |
| Indexes | `idx_{table}_{columns}` | `idx_users_email` |
| Unique constraints | `uq_{table}_{columns}` | `uq_users_email` |
| Check constraints | `chk_{table}_{description}` | `chk_orders_positive_total` |
| Timestamps | `created_at`, `updated_at`, `deleted_at` (soft delete) |

## Soft Deletes

Prefer soft deletes for user-generated data. Use `deleted_at TIMESTAMPTZ NULL`.

```typescript
// Soft delete
await db('users').where({ id }).update({ deleted_at: new Date() });

// Query must always filter soft-deleted records
const user = await db('users').where({ id, deleted_at: null }).first();
```

Add a partial index to exclude soft-deleted rows from common queries:
```sql
CREATE INDEX idx_users_active ON users(email) WHERE deleted_at IS NULL;
```

## Migration Rules

1. Every migration has a forward script and a rollback script
2. Prisma migrations are named as folder timestamps: `YYYYMMDDHHMMSS_description/` with `migration.sql`
3. Never modify an already-deployed migration — write a new one
4. Test rollback in development before deploying
5. High-risk migrations (see `agents/database-expert.md`) require the expand/contract pattern

## Connection Pooling

```typescript
// Recommended pool configuration
{
  min: 2,           // minimum connections held open
  max: 10,          // maximum concurrent connections
  acquireTimeoutMillis: 30_000,
  idleTimeoutMillis: 30_000,
  reapIntervalMillis: 1_000,
}
```

Do not set `max` above the database server's `max_connections` limit divided by number of app instances.

## Security

- Parameterized queries or ORM only — no string interpolation in SQL
- Credentials in environment variables only
- Row-level security: verify `user_id` ownership in queries, not just at middleware level
- No PII in query logs (mask or omit logged query parameters containing email, password, tokens)
