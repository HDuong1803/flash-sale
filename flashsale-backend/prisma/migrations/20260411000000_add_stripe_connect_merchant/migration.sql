-- Migration: Add Stripe Connect fields to merchant_profiles
-- Strategy: Destination Charges — payment goes to platform, auto-transferred to merchant

ALTER TABLE "merchant_profiles"
  ADD COLUMN "stripe_account_id"         VARCHAR(255)  NULL,
  ADD COLUMN "stripe_account_status"     VARCHAR(50)   NOT NULL DEFAULT 'NOT_CONNECTED',
  ADD COLUMN "stripe_charges_enabled"    BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN "stripe_payouts_enabled"    BOOLEAN       NOT NULL DEFAULT FALSE,
  ADD COLUMN "stripe_connected_at"       TIMESTAMP(6)  NULL;

-- stripe_account_status: NOT_CONNECTED | PENDING | ACTIVE | RESTRICTED | DISABLED
CREATE INDEX "merchant_profiles_stripe_account_id_idx" ON "merchant_profiles"("stripe_account_id");
CREATE INDEX "merchant_profiles_stripe_account_status_idx" ON "merchant_profiles"("stripe_account_status");
