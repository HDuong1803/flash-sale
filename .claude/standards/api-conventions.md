# API Conventions Standard

## URL Structure

```
/api/v{n}/{resource}
/api/v{n}/{resource}/{id}
/api/v{n}/{resource}/{id}/{sub-resource}
```

- Lowercase, kebab-case: `/api/v1/user-profiles` not `/api/v1/UserProfiles`
- Plural nouns: `/api/v1/orders` not `/api/v1/order`
- Nesting maximum 2 levels: `/api/v1/users/{id}/orders` (not deeper)
- Actions that do not fit REST: `/api/v1/orders/{id}/cancel` (verb as sub-resource)

## HTTP Methods

| Method | Action | Idempotent | Body |
|--------|--------|-----------|------|
| GET | Read | Yes | No |
| POST | Create | No | Yes |
| PUT | Replace | Yes | Yes |
| PATCH | Update | Yes | Yes |
| DELETE | Delete | Yes | No |

## Status Codes

| Code | Use when |
|------|---------|
| 200 | Successful GET, PATCH, DELETE |
| 201 | Successful POST (resource created) |
| 204 | Successful DELETE (no body) |
| 400 | Client error — invalid input |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized |
| 404 | Resource not found |
| 409 | Conflict (duplicate, state mismatch) |
| 422 | Validation error with field details |
| 429 | Rate limit exceeded |
| 500 | Server error (no details to client) |

## Response Envelope

All responses use this envelope:

```typescript
// Success — single resource
{
  "success": true,
  "data": { ... }
}

// Success — collection
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 143,
    "totalPages": 8
  }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "email": ["Invalid email format"],
      "password": ["Minimum 8 characters required"]
    }
  }
}
```

Never return raw database rows. Never return array as root response.

## Pagination

Default: cursor-based for large datasets, offset-based for admin/report views.

```
GET /api/v1/posts?page=1&limit=20
GET /api/v1/posts?cursor=eyJpZCI6MTAwfQ&limit=20
```

Always enforce a maximum `limit` (100 is a sensible default). Never return unbounded lists.

## Filtering & Sorting

```
GET /api/v1/orders?status=pending&createdAfter=2024-01-01
GET /api/v1/users?sortBy=createdAt&order=desc
```

- Filter params: camelCase query params matching field names
- Date params: ISO 8601 format (`2024-01-15T09:00:00Z`)
- Multiple values: comma-separated or repeated params (`status=a,b` or `status=a&status=b`)

## Naming Conventions

- JSON fields: camelCase (`firstName`, `createdAt`, `userId`)
- Query params: camelCase (`sortBy`, `pageSize`)
- Error codes: UPPER_SNAKE_CASE (`NOT_FOUND`, `VALIDATION_ERROR`)

## Versioning

- Version in URL path: `/api/v1/`
- Breaking changes require a new version
- Old versions supported for minimum 6 months after new version is stable
- `Sunset` header on deprecated endpoints

## Idempotency

POST endpoints that have side effects (payments, emails, etc.) must accept an
`Idempotency-Key` header. Store the key and response for 24 hours. Return the
cached response for duplicate keys.

## Documentation

Every endpoint must be documented in `docs/technical/API.md` with:
- Method + URL
- Authentication requirement
- Request body schema
- Response schema
- Error codes
- Example request/response
