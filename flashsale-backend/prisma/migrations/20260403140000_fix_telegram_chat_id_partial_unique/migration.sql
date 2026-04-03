-- Fix: Replace full unique index on telegram_chat_id with a partial unique index.
-- Rationale: A full unique index blocks re-use of the same chat_id after an unlink
-- because revoked rows (revoked_at IS NOT NULL) still occupy the unique constraint.
-- A partial unique index only enforces uniqueness among active (non-revoked) links,
-- allowing a different user to link the same Telegram chat after the previous link
-- has been revoked.

-- Drop the full unique index created by the initial migration
DROP INDEX IF EXISTS "telegram_links_telegram_chat_id_key";

-- Partial unique index: only one active link per chat_id at a time
CREATE UNIQUE INDEX "telegram_links_active_chat_id_key"
  ON "telegram_links"("telegram_chat_id")
  WHERE "revoked_at" IS NULL;

-- Non-unique index for general lookups across all rows (including revoked)
CREATE INDEX "telegram_links_telegram_chat_id_idx"
  ON "telegram_links"("telegram_chat_id");
