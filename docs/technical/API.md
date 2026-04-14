# API Reference

**Owner**: @backend-developer
**Base URL**: `http://localhost:3000/api/v1` (default local backend)
**Authentication**: Bearer token (JWT)
**Content-Type**: `application/json`
**Last updated**: 2026-04-03

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
    "user": { "id": "cuid", "email": "user@example.com", "name": "Jane Doe" },
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
    "user": { "id": "cuid", "email": "user@example.com", "name": "Jane Doe" },
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
    "id": "cuid",
    "email": "user@example.com",
    "name": "Jane Doe",
    "createdAt": "2024-01-15T09:00:00Z"
  }
}
```

---

### Campaigns

#### PATCH /api/v1/campaigns/:id/hide-expired

Merchant ẩn chiến dịch đã kết thúc khỏi danh sách chiến dịch của chính merchant đó.

**Auth required**: Yes (`MERCHANT`)

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "hidden": true
  }
}
```

**Rules**:
- Chỉ áp dụng với campaign thuộc merchant hiện tại.
- Chỉ áp dụng khi campaign đang ở trạng thái `ENDED`.

**Errors**: `400 BAD_REQUEST`, `403 FORBIDDEN`, `404 NOT_FOUND`

---

### Admin

#### DELETE /api/v1/admin/campaigns/:id

Admin xóa mềm campaign đã kết thúc khỏi danh sách quản trị.

**Auth required**: Yes (`ADMIN`)

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

**Rules**:
- Chỉ xóa được campaign ở trạng thái `ENDED`.
- Thao tác là soft-delete bằng trường `deleted_at`.

**Errors**: `400 BAD_REQUEST`, `403 FORBIDDEN`, `404 NOT_FOUND`

---

#### GET /api/v1/admin/merchant-profiles/:id/overview?days=30

Admin xem dashboard chi tiết của một merchant theo merchant key (`id`).

**Auth required**: Yes (`ADMIN`)

**Query params**:
- `days` (optional, default `30`, range `1..365`): số ngày dùng để tính doanh thu theo cửa sổ thời gian.

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "profile": {
      "id": "merchant_id",
      "businessName": "Shop ABC",
      "taxCode": "0123456789",
      "businessEmail": "owner@example.com",
      "kycStatus": "APPROVED"
    },
    "metrics": {
      "revenueTotal": 128000000,
      "revenueInRange": 21500000,
      "ordersTotal": 540,
      "ordersDone": 501,
      "ordersCancelled": 39,
      "campaignsTotal": 18
    },
    "campaigns": [],
    "recentOrders": [],
    "topProducts": [],
    "timeframe": {
      "days": 30,
      "since": "2026-03-04T00:00:00.000Z",
      "until": "2026-04-03T00:00:00.000Z"
    }
  }
}
```

**Errors**: `403 FORBIDDEN`, `404 NOT_FOUND`

---

### Notifications

#### POST /api/v1/notifications/telegram/link-token

Tạo deep-link token để user liên kết Telegram bot với tài khoản hiện tại.

**Auth required**: Yes

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "botUsername": "flashsale_notify_bot",
    "deepLink": "https://t.me/flashsale_notify_bot?start=token_value",
    "expiresInSeconds": 600
  }
}
```

---

#### GET /api/v1/notifications/telegram/status

Lấy trạng thái liên kết Telegram của user hiện tại.

**Auth required**: Yes

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "linked": true,
    "telegramUsername": "alice_store",
    "telegramFirstName": "Alice",
    "linkedAt": "2026-04-03T10:30:00.000Z"
  }
}
```

---

#### DELETE /api/v1/notifications/telegram/link

Hủy liên kết Telegram hiện tại và tự động tắt `telegramEnabled` trong preferences.

**Auth required**: Yes

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "revoked": true
  }
}
```

---

#### POST /api/v1/integrations/telegram/webhook

Webhook endpoint nhận callback từ Telegram bot.

**Auth required**: No

**Required header**:
```http
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

**Compatibility note**:
- Legacy route `POST /api/v1/integrations/telegram/webhook/:secret` vẫn còn hỗ trợ tạm thời để migration webhook cũ.
- Nếu header `X-Telegram-Bot-Api-Secret-Token` xuất hiện nhưng sai, request sẽ bị từ chối ngay (không fallback sang path secret).
- Fallback cũ mặc định đã tắt (`TELEGRAM_ALLOW_LEGACY_PATH_SECRET_AUTH=false`). Chỉ bật tạm thời khi cần migration.
- Khuyến nghị cập nhật Telegram webhook về route mới và xác thực bằng header secret token.

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "ok": true
  }
}
```

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-03 | 1.3.1 | Telegram webhook auth migrated to `X-Telegram-Bot-Api-Secret-Token` header, legacy path-secret route deprecated |
| 2026-04-03 | 1.3.0 | Add Telegram link/token/status/unlink APIs and webhook endpoint |
| 2026-04-03 | 1.2.0 | Add `GET /admin/merchant-profiles/:id/overview` for detailed merchant analytics |
| 2026-04-03 | 1.1.0 | Add `PATCH /campaigns/:id/hide-expired` and `DELETE /admin/campaigns/:id` |
| [YYYY-MM-DD] | 1.0.0 | Initial API |
