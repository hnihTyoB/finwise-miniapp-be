-- CreateEnum
CREATE TYPE "RecurringTransactionFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "RecurringTransactionMissedRunPolicy" AS ENUM ('SKIP', 'CATCH_UP');

-- CreateEnum
CREATE TYPE "RecurringTransactionOccurrenceStatus" AS ENUM ('POSTED', 'FAILED');

-- CreateTable
CREATE TABLE "recurring_transaction_schedules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "frequency" "RecurringTransactionFrequency" NOT NULL,
    "repeat_interval" INTEGER NOT NULL DEFAULT 1,
    "anchor_date" DATE NOT NULL,
    "end_date" DATE,
    "next_run_at" DATE,
    "missed_run_policy" "RecurringTransactionMissedRunPolicy" NOT NULL DEFAULT 'SKIP',
    "last_run_at" TIMESTAMPTZ(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_transaction_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_transaction_schedules_amount_positive_check" CHECK ("amount" > 0),
    CONSTRAINT "recurring_transaction_schedules_repeat_interval_positive_check" CHECK ("repeat_interval" > 0),
    CONSTRAINT "recurring_transaction_schedules_end_date_check" CHECK ("end_date" IS NULL OR "end_date" >= "anchor_date"),
    CONSTRAINT "recurring_transaction_schedules_active_next_run_check" CHECK (NOT "is_active" OR ("deleted_at" IS NULL AND "next_run_at" IS NOT NULL))
);

-- CreateTable
CREATE TABLE "recurring_transaction_occurrences" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "scheduled_for" DATE NOT NULL,
    "status" "RecurringTransactionOccurrenceStatus" NOT NULL DEFAULT 'POSTED',
    "transaction_id" UUID,
    "failure_code" VARCHAR(100),
    "failure_message" VARCHAR(500),
    "attempt_count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_transaction_occurrences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_transaction_occurrences_attempt_count_positive_check" CHECK ("attempt_count" > 0),
    CONSTRAINT "recurring_transaction_occurrences_status_payload_check" CHECK (
      ("status" = 'POSTED' AND "failure_code" IS NULL)
      OR ("status" = 'FAILED' AND "transaction_id" IS NULL AND "failure_code" IS NOT NULL)
    )
);

-- CreateIndex
CREATE INDEX "recurring_transaction_schedules_user_id_deleted_at_is_active_idx" ON "recurring_transaction_schedules"("user_id", "deleted_at", "is_active");
CREATE INDEX "recurring_transaction_schedules_is_active_next_run_at_idx" ON "recurring_transaction_schedules"("is_active", "next_run_at");
CREATE INDEX "recurring_transaction_schedules_wallet_id_idx" ON "recurring_transaction_schedules"("wallet_id");
CREATE INDEX "recurring_transaction_schedules_category_id_idx" ON "recurring_transaction_schedules"("category_id");
CREATE UNIQUE INDEX "recurring_transaction_occurrences_transaction_id_key" ON "recurring_transaction_occurrences"("transaction_id");
CREATE UNIQUE INDEX "recurring_transaction_occurrences_schedule_id_scheduled_for_key" ON "recurring_transaction_occurrences"("schedule_id", "scheduled_for");
CREATE INDEX "recurring_transaction_occurrences_schedule_id_created_at_idx" ON "recurring_transaction_occurrences"("schedule_id", "created_at");
CREATE INDEX "recurring_transaction_occurrences_status_updated_at_idx" ON "recurring_transaction_occurrences"("status", "updated_at");

-- AddForeignKey
ALTER TABLE "recurring_transaction_schedules" ADD CONSTRAINT "recurring_transaction_schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_transaction_schedules" ADD CONSTRAINT "recurring_transaction_schedules_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_transaction_schedules" ADD CONSTRAINT "recurring_transaction_schedules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "recurring_transaction_occurrences" ADD CONSTRAINT "recurring_transaction_occurrences_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_transaction_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_transaction_occurrences" ADD CONSTRAINT "recurring_transaction_occurrences_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
