-- DropForeignKey
ALTER TABLE "public"."CampaignProduct" DROP CONSTRAINT "CampaignProduct_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CustomerProfile" DROP CONSTRAINT "CustomerProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Inventory" DROP CONSTRAINT "Inventory_productId_fkey";

-- DropForeignKey
ALTER TABLE "public"."MerchantProfile" DROP CONSTRAINT "MerchantProfile_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_orderId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PreRegistration" DROP CONSTRAINT "PreRegistration_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "public"."PreRegistration" DROP CONSTRAINT "PreRegistration_customerId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StockAuditLog" DROP CONSTRAINT "StockAuditLog_productId_fkey";

-- AlterTable: Campaign
ALTER TABLE "Campaign"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT;

-- AlterTable: CampaignProduct (add timestamps with defaults)
ALTER TABLE "CampaignProduct"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: CustomerProfile
ALTER TABLE "CustomerProfile"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: DeadLetterJob
ALTER TABLE "DeadLetterJob"
  ADD COLUMN "lastRetryAt" TIMESTAMP(3),
  ADD COLUMN "originalQueue" TEXT NOT NULL DEFAULT '';

-- AlterTable: Inventory
ALTER TABLE "Inventory"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: MerchantProfile
ALTER TABLE "MerchantProfile"
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedBy" TEXT;

-- AlterTable: Order
ALTER TABLE "Order"
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMP(3);

-- AlterTable: OrderItem
ALTER TABLE "OrderItem"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "originalPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable: Payment (drop old orderId NOT NULL, add new columns)
ALTER TABLE "Payment"
  ADD COLUMN "failureReason" TEXT,
  ADD COLUMN "reservationId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "orderId" DROP NOT NULL;

-- AlterTable: Product
ALTER TABLE "Product"
  ADD COLUMN "category" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

-- AlterTable: Reservation
ALTER TABLE "Reservation"
  ADD COLUMN "shippingAddress" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable: User
ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Campaign_merchantId_idx" ON "Campaign"("merchantId");
CREATE INDEX IF NOT EXISTS "Campaign_startTime_idx" ON "Campaign"("startTime");
CREATE INDEX IF NOT EXISTS "Campaign_endTime_idx" ON "Campaign"("endTime");
CREATE INDEX IF NOT EXISTS "DeadLetterJob_type_idx" ON "DeadLetterJob"("type");
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx" ON "Inventory"("productId");
CREATE INDEX IF NOT EXISTS "MerchantProfile_kycStatus_idx" ON "MerchantProfile"("kycStatus");
CREATE INDEX IF NOT EXISTS "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Payment_reservationId_key" ON "Payment"("reservationId");
CREATE INDEX IF NOT EXISTS "Payment_status_idx" ON "Payment"("status");
CREATE INDEX IF NOT EXISTS "Product_status_deletedAt_idx" ON "Product"("status", "deletedAt");
CREATE INDEX IF NOT EXISTS "StockAuditLog_createdAt_idx" ON "StockAuditLog"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "MerchantProfile" ADD CONSTRAINT "MerchantProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerProfile" ADD CONSTRAINT "CustomerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignProduct" ADD CONSTRAINT "CampaignProduct_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreRegistration" ADD CONSTRAINT "PreRegistration_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PreRegistration" ADD CONSTRAINT "PreRegistration_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockAuditLog" ADD CONSTRAINT "StockAuditLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Remove temp defaults
ALTER TABLE "CampaignProduct" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "CustomerProfile" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "DeadLetterJob" ALTER COLUMN "originalQueue" DROP DEFAULT;
ALTER TABLE "OrderItem" ALTER COLUMN "originalPrice" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "reservationId" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Reservation" ALTER COLUMN "updatedAt" DROP DEFAULT;
