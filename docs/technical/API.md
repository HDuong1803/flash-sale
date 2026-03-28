# API Reference

**Owner**: @backend-developer
**Base URL**: `http://localhost:3000/api/v1` (default local backend)
**Authentication**: Bearer token (JWT)
**Content-Type**: `application/json`
**Last updated**: 2026-03-28

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer <access_token>
```

Access tokens expire after 15 minutes. Use the refresh endpoint to obtain a new access token.

---

## Standard Response Format

```json
// Success
{ "success": true, "data": { } }

// Success — collection
{ "success": true, "data": [], "meta": { "page": 1, "limit": 20, "total": 143, "totalPages": 8 } }

// Error
{ "success": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": { } } }
```

## Error Codes

| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request body failed validation |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Authenticated but not authorized |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate resource or state conflict |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error (no details exposed) |

---

## Rate Limiting

- General API: 100 requests / 15 minutes per IP
- Auth endpoints: 10 requests / 15 minutes per IP
- Headers returned: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Endpoints

TODO(fill-with-project-context): synchronize this file with actual endpoints under `flashsale-backend/src/modules/**`.
At minimum, maintain sections for: auth, campaign, product, checkout, order, payment, dashboard, admin.

### Auth

#### POST /api/v1/auth/register

Create a new user account.

**Auth required**: No

**Request body**:
```json
{
  "email": "user@example.com",
  "password": "minimum8chars",
  "name": "Jane Doe"
}
```

**Response** `201`:
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "name": "Jane Doe" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors**: `400 VALIDATION_ERROR`, `409 CONFLICT` (email already registered)

---

#### POST /api/v1/auth/login

Authenticate and receive tokens.

**Auth required**: No

**Request body**:
```json
{ "email": "user@example.com", "password": "yourpassword" }
```

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "user": { "id": "uuid", "email": "user@example.com", "name": "Jane Doe" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors**: `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (invalid credentials)

---

#### POST /api/v1/auth/refresh

Exchange a refresh token for a new access token.

**Auth required**: No

**Request body**:
```json
{ "refreshToken": "eyJ..." }
```

**Response** `200`:
```json
{
  "success": true,
  "data": { "accessToken": "eyJ..." }
}
```

**Errors**: `401 UNAUTHORIZED` (expired or invalid refresh token)

---

#### POST /api/v1/auth/logout

Revoke the current refresh token.

**Auth required**: Yes

**Request body**:
```json
{ "refreshToken": "eyJ..." }
```

**Response** `204`: No body

---

### Users

#### GET /api/v1/users/me

Get the authenticated user's profile.

**Auth required**: Yes

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "createdAt": "2024-01-15T09:00:00Z"
  }
}
```

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| [YYYY-MM-DD] | 1.0.0 | Initial API |
