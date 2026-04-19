# Database Reference

**Owner**: @database-expert
**Engine**: PostgreSQL 16
**ORM**: Prisma 6.x
**Connection**: `DATABASE_URL` environment variable
**Last updated**: 2026-04-18

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
| `id` | VARCHAR(36) | PK, CUID (`@default(cuid())`) | |
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
| `id` | VARCHAR(36) | PK, CUID (`@default(cuid())`) | |
| `user_id` | VARCHAR(36) | NOT NULL, FK → users.id ON DELETE CASCADE | |
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

### campaigns (delta)

**Purpose**: Quản lý campaign flash sale theo merchant và vòng đời vận hành.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | VARCHAR(36) | PK | Campaign ID |
| `merchant_id` | VARCHAR(36) | NOT NULL, FK | Merchant sở hữu campaign |
| `status` | ENUM | NOT NULL | Vòng đời campaign (`DRAFT`, `APPROVED`, `SCHEDULED`, `ACTIVE`, `ENDED`) |
| `deleted_at` | TIMESTAMP(6) | NULL | Soft-delete cho thao tác admin xóa campaign đã hết hạn |
| `merchant_hidden_at` | TIMESTAMP(6) | NULL | Merchant ẩn campaign ENDED khỏi danh sách của mình |

**Notes**:
- Query danh sách campaign (public/admin/merchant) cần mặc định loại bản ghi có `deleted_at IS NOT NULL`.
- Merchant list cần ẩn thêm campaign thỏa `status = ENDED` và `merchant_hidden_at IS NOT NULL`.

---

### campaign_analytics_snapshots (delta)

**Purpose**: Lưu time-series analytics theo chu kỳ 5 phút cho campaign product đang ACTIVE.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | VARCHAR(36) | PK | Snapshot id |
| `campaign_id` | VARCHAR(36) | NOT NULL, INDEX | Campaign ID |
| `campaign_product_id` | VARCHAR(36) | NOT NULL, INDEX | Campaign product ID |
| `snapshot_at` | TIMESTAMP(6) | NOT NULL, DEFAULT now(), INDEX | Thời điểm snapshot |
| `stock_remaining` | INT | NOT NULL | Tồn kho còn lại |
| `stock_total` | INT | NOT NULL | Tổng tồn kho ban đầu |
| `purchase_count` | INT | NOT NULL | Tổng đơn thành công |
| `revenue` | FLOAT | NOT NULL | Tổng doanh thu |

**Retention & Cleanup**:
- Cleanup chạy hằng ngày (2:00 AM server time) bằng batch delete.
- Chính sách mặc định giữ dữ liệu `30` ngày.
- Config qua env:
  - `ANALYTICS_SNAPSHOT_CLEANUP_ENABLED=true`
  - `ANALYTICS_SNAPSHOT_RETENTION_DAYS=30`
  - `ANALYTICS_SNAPSHOT_CLEANUP_BATCH_SIZE=5000`
  - `ANALYTICS_SNAPSHOT_CLEANUP_MAX_BATCHES=24`
- Nếu dữ liệu cũ vượt `batch_size * max_batches`, phần còn lại sẽ tiếp tục xóa ở chu kỳ kế tiếp để tránh spike tải DB.

---

### notification_preferences (delta)

**Purpose**: Lưu cấu hình nhận thông báo theo user.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `telegram_enabled` | BOOLEAN | NOT NULL, DEFAULT false | Bật/tắt gửi thông báo qua Telegram bot |

---

### telegram_links

**Purpose**: Mapping 1-1 giữa user hệ thống và Telegram chat cá nhân đã liên kết.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | VARCHAR(36) | PK | Telegram link id |
| `user_id` | VARCHAR(36) | UNIQUE, FK -> users.id | User được liên kết |
| `telegram_chat_id` | VARCHAR(255) | UNIQUE | Telegram chat cá nhân |
| `telegram_user_id` | VARCHAR(255) | INDEX | Telegram user id |
| `telegram_username` | VARCHAR(255) | NULL | Username Telegram |
| `telegram_first_name` | VARCHAR(255) | NULL | First name Telegram |
| `telegram_last_name` | VARCHAR(255) | NULL | Last name Telegram |
| `linked_at` | TIMESTAMP(6) | NOT NULL | Thời điểm liên kết |
| `revoked_at` | TIMESTAMP(6) | NULL, INDEX | Thời điểm hủy liên kết |
| `last_interaction_at` | TIMESTAMP(6) | NULL | Lần tương tác gần nhất |

---

### telegram_deliveries

**Purpose**: Audit và theo dõi trạng thái gửi Telegram theo từng notification.

| Column | Type | Constraints | Description |
|--------|------|------------|-------------|
| `id` | VARCHAR(36) | PK | Delivery id |
| `user_id` | VARCHAR(36) | FK -> users.id, INDEX | Recipient user |
| `notification_id` | VARCHAR(36) | NULL, FK -> notifications.id, INDEX | Optional link về in-app notification |
| `event_type` | ENUM(NotificationType) | NOT NULL | Loại notification |
| `idempotency_key` | VARCHAR(120) | UNIQUE | Chống gửi trùng |
| `status` | ENUM(TelegramDeliveryStatus) | NOT NULL | `PENDING`, `SENT`, `FAILED` |
| `attempt_count` | INT | NOT NULL | Số lần retry |
| `provider_message_id` | VARCHAR(120) | NULL | Message id của Telegram |
| `error_code` | VARCHAR(120) | NULL | Mã lỗi provider/internal |
| `error_message` | TEXT | NULL | Mô tả lỗi gần nhất |
| `sent_at` | TIMESTAMP(6) | NULL | Thời điểm gửi thành công |

---

## Migrations Log

| Migration | Date | Description | Risk |
|-----------|------|-------------|------|
| `20260418102000_add_analytics_snapshot_time_index` | 2026-04-18 | Add index `campaign_analytics_snapshots(snapshot_at)` for retention cleanup query | Low |
| `20260403130000_add_telegram_notifications_phase1` | 2026-04-03 | Add Telegram link + delivery tables and `notification_preferences.telegram_enabled` | Medium |
| `20260403113000_add_merchant_hidden_campaign` | 2026-04-03 | Add `campaigns.merchant_hidden_at` | Low |
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
