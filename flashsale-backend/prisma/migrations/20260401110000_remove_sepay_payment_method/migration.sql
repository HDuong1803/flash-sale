-- Remove SePay payment method
-- Step 1: Delete any SePay payment gateway configs
DELETE FROM "payment_gateway_configs" WHERE "gateway" = 'SEPAY';

-- Step 2: Recreate PaymentMethod enum without SEPAY
-- PostgreSQL does not support DROP VALUE from an enum, so we must recreate it.
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
CREATE TYPE "PaymentMethod" AS ENUM ('VNPAY', 'MOMO', 'STRIPE');
ALTER TABLE "payments" ALTER COLUMN "method" TYPE "PaymentMethod" USING "method"::text::"PaymentMethod";
ALTER TABLE "payment_gateway_configs" ALTER COLUMN "gateway" TYPE "PaymentMethod" USING "gateway"::text::"PaymentMethod";
DROP TYPE "PaymentMethod_old";
