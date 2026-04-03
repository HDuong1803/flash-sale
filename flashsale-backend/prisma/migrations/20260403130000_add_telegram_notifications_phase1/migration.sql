-- Telegram notifications phase 1

ALTER TABLE "notification_preferences"
ADD COLUMN "telegram_enabled" BOOLEAN NOT NULL DEFAULT false;

ALTER TYPE "NotificationType" ADD VALUE 'SYSTEM_ALERT';

CREATE TYPE "TelegramDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "telegram_links" (
  "id" VARCHAR(36) NOT NULL,
  "user_id" VARCHAR(36) NOT NULL,
  "telegram_chat_id" VARCHAR(255) NOT NULL,
  "telegram_user_id" VARCHAR(255) NOT NULL,
  "telegram_username" VARCHAR(255),
  "telegram_first_name" VARCHAR(255),
  "telegram_last_name" VARCHAR(255),
  "linked_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revoked_at" TIMESTAMP(6),
  "last_interaction_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "telegram_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_deliveries" (
  "id" VARCHAR(36) NOT NULL,
  "user_id" VARCHAR(36) NOT NULL,
  "notification_id" VARCHAR(36),
  "event_type" "NotificationType" NOT NULL,
  "idempotency_key" VARCHAR(120) NOT NULL,
  "status" "TelegramDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "provider_message_id" VARCHAR(120),
  "error_code" VARCHAR(120),
  "error_message" TEXT,
  "sent_at" TIMESTAMP(6),
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL,

  CONSTRAINT "telegram_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_links_user_id_key" ON "telegram_links"("user_id");
CREATE UNIQUE INDEX "telegram_links_telegram_chat_id_key" ON "telegram_links"("telegram_chat_id");
CREATE INDEX "telegram_links_telegram_user_id_idx" ON "telegram_links"("telegram_user_id");
CREATE INDEX "telegram_links_revoked_at_idx" ON "telegram_links"("revoked_at");

CREATE UNIQUE INDEX "telegram_deliveries_idempotency_key_key" ON "telegram_deliveries"("idempotency_key");
CREATE INDEX "telegram_deliveries_user_id_created_at_idx" ON "telegram_deliveries"("user_id", "created_at" DESC);
CREATE INDEX "telegram_deliveries_status_created_at_idx" ON "telegram_deliveries"("status", "created_at");
CREATE INDEX "telegram_deliveries_notification_id_idx" ON "telegram_deliveries"("notification_id");

ALTER TABLE "telegram_links"
ADD CONSTRAINT "telegram_links_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_deliveries"
ADD CONSTRAINT "telegram_deliveries_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_deliveries"
ADD CONSTRAINT "telegram_deliveries_notification_id_fkey"
FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;
