-- CreateEnum
CREATE TYPE "StatementExportFormat" AS ENUM ('XLSX', 'PDF', 'CSV');

-- CreateEnum
CREATE TYPE "StatementJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "statement_jobs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "format" "StatementExportFormat" NOT NULL,
    "status" "StatementJobStatus" NOT NULL DEFAULT 'PENDING',
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "is_password_protected" BOOLEAN NOT NULL DEFAULT false,
    "password_hint" VARCHAR(100),
    "file_url" TEXT,
    "file_key" VARCHAR(512),
    "file_size" INTEGER,
    "record_count" INTEGER,
    "verification_code" VARCHAR(64) NOT NULL,
    "error" TEXT,
    "expires_at" TIMESTAMPTZ(3),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "statement_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "statement_jobs_verification_code_key" ON "statement_jobs"("verification_code");

-- CreateIndex
CREATE INDEX "statement_jobs_user_id_status_created_at_idx" ON "statement_jobs"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "statement_jobs_user_id_created_at_idx" ON "statement_jobs"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "statement_jobs_verification_code_idx" ON "statement_jobs"("verification_code");

-- CreateIndex
CREATE INDEX "statement_jobs_expires_at_idx" ON "statement_jobs"("expires_at");

-- AddForeignKey
ALTER TABLE "statement_jobs" ADD CONSTRAINT "statement_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "statement_jobs" ADD CONSTRAINT "statement_jobs_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
