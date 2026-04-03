# Telegram Notification Integration Plan

Owner: @systems-architect + @backend-developer + @frontend-developer
Last updated: 2026-04-03
Status: Draft for implementation

## 1) Scope and Objectives

Mục tiêu phase này là tích hợp Telegram Bot làm kênh thông báo cá nhân theo từng user, giữ tính bảo mật cao, gửi đúng người, đúng thời điểm, và có khả năng mở rộng để sau này gắn AI agent.

Yêu cầu chính:
- Admin nhận alert duyệt merchant, duyệt campaign, lỗi queue/system, cảnh báo bất thường traffic/hành vi.
- Merchant nhận alert đơn hàng mới, đơn bị hủy/vấn đề, campaign trạng thái thay đổi, campaign hết hàng, feedback khách hàng.
- Customer nhận alert thay đổi trạng thái đơn, đơn có vấn đề/hủy, duyệt đăng ký merchant, nhắc campaign trước 15 phút.
- Mỗi user có thể bật/tắt Telegram notification trong phần cài đặt cá nhân.
- Hỗ trợ thao tác nhanh trên Telegram cho các tác vụ phù hợp (approve/reject, update order status).

Ngoài phạm vi phase này:
- Chatbot AI hội thoại tự do với user.
- Tự động xử lý các tác vụ phức tạp nhiều bước không có xác nhận người dùng.

## 2) Design Principles

- Personal first: Không gửi vào group/channel. Chỉ gửi vào chat cá nhân đã liên kết với user.
- Secure by default: Mọi callback/action từ Telegram đều cần token ký số + TTL ngắn + re-check quyền ở server.
- Reliable delivery: Dùng queue + retry + DLQ + delivery log để không mất thông báo.
- Idempotent and traceable: Mỗi thông báo có idempotency key, có trạng thái SENT/FAILED/RETRYING.
- Extensible: Tách lớp channel adapter để sau này thêm WhatsApp/Zalo/AI assistant mà không đổi domain core.

## 3) Target Architecture

Luồng tổng quát:
1. Domain event phát sinh (order created, campaign pending approval, queue error...).
2. NotificationOrchestrator nhận event, resolve recipients theo role và entity ownership.
3. Orchestrator tạo outbox records theo channel (IN_APP, EMAIL, TELEGRAM).
4. Worker theo channel consume queue, gọi provider tương ứng.
5. TelegramDispatcher gửi message + inline actions qua Telegram Bot API.
6. Webhook nhận callback từ Telegram, verify chữ ký/token, thực thi action, trả kết quả về chat.
7. Delivery log + metrics + DLQ dùng cho vận hành.

Module đề xuất ở backend:
- NotificationOrchestratorService (mới)
- TelegramModule (mới)
- TelegramBotService (send message, send media, edit message)
- TelegramWebhookController (handle update/callback)
- TelegramActionService (approve/reject/order status transitions)
- TelegramDeliveryRepository (tracking)

Queue đề xuất:
- telegram.notification
- failed_telegram_notifications
- system.alert (admin-critical)
- failed_system_alerts

## 4) Data Model Changes

### 4.1 Notification preferences

Mở rộng NotificationPreference:
- telegramEnabled: boolean (default false)
- emailEnabled: boolean (default true)
- adminCriticalAlertEnabled: boolean (default true, áp dụng cho admin)

Giữ các cờ hiện có:
- notificationsEnabled
- campaignReminderEnabled
- orderStatusEnabled

Quy tắc:
- notificationsEnabled = false thì tắt toàn bộ channel.
- telegramEnabled chỉ cho phép gửi Telegram khi đã link thành công.

### 4.2 Telegram account link

Thêm bảng TelegramLink:
- id
- userId (unique)
- telegramChatId (string, encrypted at rest)
- telegramUserId (string)
- telegramUsername (nullable)
- telegramFirstName (nullable)
- telegramLastName (nullable)
- isVerified (boolean)
- linkedAt
- revokedAt (nullable)
- lastInteractionAt
- createdAt
- updatedAt

Thêm bảng TelegramDelivery:
- id
- userId
- notificationId (nullable, nếu có in-app twin)
- eventType
- idempotencyKey (unique)
- chatIdMasked
- payload (json)
- status (PENDING, SENT, FAILED, RETRYING, DLQ)
- providerMessageId (nullable)
- errorCode (nullable)
- errorMessage (nullable)
- attemptCount
- sentAt (nullable)
- createdAt
- updatedAt

### 4.3 Action token table

Thêm bảng NotificationActionToken:
- id
- tokenHash
- userId
- role
- actionType
- resourceType
- resourceId
- expiresAt
- usedAt (nullable)
- createdAt

Mục tiêu: chống replay, ép one-time action, audit được đầy đủ.

## 5) API and Webhook Contracts

API cho user settings:
- GET /api/v1/notifications/preferences
- PATCH /api/v1/notifications/preferences
  - thêm fields telegramEnabled, emailEnabled, adminCriticalAlertEnabled

API link Telegram:
- POST /api/v1/notifications/telegram/link-token
  - trả deep-link token TTL ngắn để user bấm mở bot
- GET /api/v1/notifications/telegram/status
  - trả trạng thái linked, username, linkedAt
- DELETE /api/v1/notifications/telegram/link
  - unlink chat

Webhook bot:
- POST /api/v1/integrations/telegram/webhook
  - verify header `X-Telegram-Bot-Api-Secret-Token`
  - nếu có header nhưng token sai thì reject ngay, không fallback về path secret
  - route `/webhook/:secret` chỉ giữ tạm thời để migration, mặc định tắt và chỉ bật khi cần bằng `TELEGRAM_ALLOW_LEGACY_PATH_SECRET_AUTH=true`
  - xử lý /start token, callback_query, command cơ bản

Nguyên tắc callback action:
- callback_data chỉ chứa actionRef ngắn.
- Server lookup actionRef -> verify user binding + role + TTL + resource state.
- Thực thi xong phải mark usedAt.

## 6) Event Matrix by Persona

### 6.1 Admin

Merchant registration pending:
- Trigger: merchant profile tạo mới hoặc status chuyển PENDING.
- Message: business name, tax code, owner info, createdAt, risk hints.
- Actions: View detail, Approve, Reject.

Campaign pending approval:
- Trigger: campaign chuyển trạng thái chờ duyệt.
- Message: campaign name, merchant, start/end time, danh sách sản phẩm, giá gốc/giá sale, ảnh thumb, link detail.
- Actions: View detail, Approve, Reject.

Queue/system error alert:
- Trigger: job vào DLQ, retry vượt ngưỡng, uncaught exception.
- Message: service/module, queue, error summary, stack trace rút gọn, correlation id, thời gian.
- Actions: Open admin DLQ, Retry job (nếu an toàn).

Traffic/behavior anomaly:
- Trigger: monitor rule breach (QPS spike, conversion drop, bot-like behavior).
- Message: metric, baseline, current value, threshold, affected campaign.
- Actions: Open monitor, Open campaign detail.

### 6.2 Merchant

New order:
- Trigger: order created/confirmed.
- Message: order id, items, quantities, shipping summary, customer alias, total amount.
- Actions: View order, Mark processing, Mark shipping, Mark done.

Order cancelled or incident:
- Trigger: order cancelled/payment failed after reservation.
- Message: order id, reason, who cancelled, thời điểm.
- Actions: View order, Contact support link.

Customer feedback:
- Trigger: feedback mới cho merchant/product.
- Message: rating, content, customer alias, product/campaign.
- Actions: View feedback, Reply (short template).

Campaign lifecycle:
- Trigger: campaign approved/rejected/scheduled/active/ended/sold-out.
- Message: trạng thái mới + lý do (nếu reject) + campaign summary.
- Actions: View campaign, Open dashboard.

### 6.3 Customer

Order status updates:
- Trigger: order đổi trạng thái quan trọng.
- Message: order id, items summary, shipping status, estimated delivery.
- Actions: View order, Contact merchant/support.

Order issue/cancelled:
- Trigger: order cancelled, payment failed hoặc incident.
- Message: lý do chi tiết, hướng dẫn bước tiếp theo.
- Actions: Retry payment, Contact support.

Merchant registration approved:
- Trigger: user đăng ký merchant được duyệt/từ chối.
- Message: kết quả duyệt + lý do từ chối (nếu có).
- Actions: Open merchant dashboard/apply page.

Campaign reminder T-15:
- Trigger: logic scheduler hiện tại.
- Message: campaign name, start time, top products.
- Actions: Open campaign.

## 7) Message Format Standards

Format thống nhất:
- Header: emoji role/event + tiêu đề ngắn.
- Body: key-value rõ ràng, xuống dòng chuẩn.
- Context: timestamp, environment, correlation id.
- CTA: tối đa 3 nút quan trọng để tránh rối.

Ví dụ admin approve merchant:
- Title: New Merchant Registration Pending Review
- Body:
  - Business: ...
  - Tax code: ...
  - Owner: ...
  - Submitted at: ...
  - Risk flags: ...
- Buttons: View Details | Approve | Reject

Stack trace policy:
- Telegram chỉ gửi rút gọn 15-25 dòng đầu + link đến full log/dashboard.
- Tuyệt đối không gửi secrets/token/raw credentials.

## 8) Security Model

- Account linking:
  - User phải login web, bấm Connect Telegram để nhận deep-link token 1 lần (TTL 10 phút).
  - Bot nhận /start token, verify hash, bind chat với đúng userId.

- Callback hardening:
  - Action token ký HMAC/JWT nội bộ, TTL 2-5 phút.
  - One-time token, invalid ngay sau khi dùng.
  - Verify role ở server trước khi mutate dữ liệu.

- Privacy:
  - Không hiển thị full PII nhạy cảm khi không cần thiết.
  - Mask phone/address một phần trong Telegram, full detail chỉ ở web.

- Abuse protection:
  - Rate limit cho webhook và callback.
  - Blocklist chat/user khi phát hiện spam/replay.

## 9) Reliability and Operations

- Retry policy:
  - exponential backoff (1m, 5m, 15m) tối đa N lần.
  - quá ngưỡng vào failed_telegram_notifications.

- Observability:
  - Metrics: sent_success_rate, send_latency_ms, retry_count, dlq_count.
  - Logs: correlation id theo notification chain.
  - Alert: success rate < 95% trong 5 phút.

- Reconciliation job:
  - Cron đối soát TelegramDelivery status PENDING quá TTL.
  - Tự retry hoặc move DLQ để tránh bỏ sót.

## 10) Frontend UX Changes

Trang Settings:
- Thêm block Telegram:
  - Connect Telegram / Reconnect / Unlink
  - Toggle: Telegram notifications
  - Badge: Linked as @username
- Toggle master giữ hành vi cũ: tắt master thì tắt toàn bộ channel.

Trang admin/merchant/customer:
- CTA link từ Telegram luôn trỏ đúng route chi tiết tương ứng.
- Nếu action hết hạn: mở web với banner "Action expired, please review again".

## 11) Rollout Plan

Phase 1 (Foundation, 1-1.5 tuần):
- Schema migration (preferences + telegram link + delivery log + action token)
- Webhook + account linking
- Basic Telegram send pipeline
- User settings toggle telegramEnabled

Phase 2 (Operational events, 1.5-2 tuần):
- Customer: order + T-15 campaign reminder
- Merchant: order new/cancel + campaign status
- Admin: merchant/campaign pending review notifications

Phase 3 (Interactive actions, 1-1.5 tuần):
- Admin approve/reject merchant/campaign trên bot
- Merchant cập nhật order status trên bot
- Audit trail đầy đủ cho action callback

Phase 4 (Advanced alerting, 1 tuần):
- Queue/system anomaly alerts
- Traffic anomaly alerts
- DLQ retry shortcuts cho admin

Phase 5 (AI-ready hooks, optional):
- Chuẩn hóa action intents + command router để cắm AI agent trả lời tự động
- Không bật autonomous actions mặc định, luôn có guardrail

## 12) Acceptance Criteria

- 100% user link Telegram cần xác thực account qua token một lần.
- Không có trường hợp gửi nhầm user (chatId-userId mismatch = 0).
- Tỷ lệ gửi thành công Telegram >= 99% với retry.
- Callback actions đều có audit log (ai, khi nào, action gì, resource nào).
- User tắt telegramEnabled thì không phát sinh telegram delivery mới.
- Có dashboard theo dõi sent/failed/retry/DLQ theo ngày.

## 13) Open Questions

- Có cho phép nhiều admin cùng nhận alert cùng lúc hay theo on-call rota?
- Merchant có cần trả lời feedback trực tiếp trên bot ở phase đầu hay chỉ deep-link về web?
- Mức chi tiết stack trace gửi Telegram cho production nên giới hạn bao nhiêu dòng?
- Có cần hỗ trợ đa ngôn ngữ message template ngay từ phase 1 không?
