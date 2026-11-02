-- AlterTable
ALTER TABLE "user_devices"
ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_user_devices_fcm_token" ON "user_devices"("fcm_token");
