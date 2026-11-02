-- AlterTable user_otps to support secure hashing, attempts tracking, cooldowns, and audit linkage
ALTER TABLE "user_otps" ALTER COLUMN "otp" TYPE VARCHAR(128);

ALTER TABLE "user_otps"
ADD COLUMN IF NOT EXISTS "otp_hash" VARCHAR(128),
ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "max_attempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN IF NOT EXISTS "resend_available_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "consumed_at" TIMESTAMPTZ(6),
ADD COLUMN IF NOT EXISTS "delivery_channel" VARCHAR(20),
ADD COLUMN IF NOT EXISTS "destination_masked" VARCHAR(150),
ADD COLUMN IF NOT EXISTS "destination_country" VARCHAR(10),
ADD COLUMN IF NOT EXISTS "request_id" VARCHAR(64);

CREATE INDEX IF NOT EXISTS "idx_user_otps_request_id" ON "user_otps"("request_id");

-- CreateTable otp_audit_logs for monitoring, compliance, and diagnostics
CREATE TABLE IF NOT EXISTS "otp_audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "otp_id" UUID,
    "user_id" UUID,
    "event_id" UUID,
    "request_id" VARCHAR(64) NOT NULL,
    "delivery_channel" VARCHAR(20) NOT NULL,
    "destination_masked" VARCHAR(150) NOT NULL,
    "destination_country" VARCHAR(10),
    "status" VARCHAR(50) NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_message_id" VARCHAR(255),
    "provider_status_code" VARCHAR(50),
    "error_code" VARCHAR(100),
    "error_message" TEXT,
    "verification_outcome" VARCHAR(50),
    "attempts_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_otp_audit_logs_request_id" ON "otp_audit_logs"("request_id");
CREATE INDEX IF NOT EXISTS "idx_otp_audit_logs_user_id" ON "otp_audit_logs"("user_id");
CREATE INDEX IF NOT EXISTS "idx_otp_audit_logs_created_at" ON "otp_audit_logs"("created_at");
