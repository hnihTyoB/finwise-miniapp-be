-- CreateEnum
CREATE TYPE "WalletType" AS ENUM ('STANDARD', 'SAVINGS_ACCOUNT');

-- CreateEnum
CREATE TYPE "TermDepositStatus" AS ENUM ('ACTIVE', 'MATURED', 'SETTLED', 'EARLY_WITHDRAWN');

-- CreateEnum
CREATE TYPE "TermDepositRolloverMethod" AS ENUM ('ROLLOVER_ALL', 'ROLLOVER_PRINCIPAL', 'SETTLE_TO_WALLET');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SAVINGS_DEPOSIT_DUE_SOON';
ALTER TYPE "NotificationType" ADD VALUE 'SAVINGS_DEPOSIT_MATURED';

-- AlterEnum
ALTER TYPE "NotificationSourceType" ADD VALUE 'SAVINGS_DEPOSIT';

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN "type" "WalletType" NOT NULL DEFAULT 'STANDARD';

-- CreateTable
CREATE TABLE "term_deposits" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "bank_name" VARCHAR(100) NOT NULL,
    "account_number" VARCHAR(100),
    "principal_amount" DECIMAL(18,2) NOT NULL,
    "interest_rate" DECIMAL(5,2) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "maturity_date" DATE NOT NULL,
    "rollover_method" "TermDepositRolloverMethod" NOT NULL DEFAULT 'ROLLOVER_ALL',
    "target_wallet_id" UUID,
    "status" "TermDepositStatus" NOT NULL DEFAULT 'ACTIVE',
    "estimated_interest" DECIMAL(18,2) NOT NULL,
    "actual_interest" DECIMAL(18,2),
    "non_term_rate" DECIMAL(5,2) NOT NULL DEFAULT 0.20,
    "settled_at" TIMESTAMPTZ(3),
    "rollover_count" INTEGER NOT NULL DEFAULT 0,
    "last_rollover_at" TIMESTAMPTZ(3),
    "is_reminder_sent_t3" BOOLEAN NOT NULL DEFAULT false,
    "is_reminder_sent_t0" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "term_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "term_deposit_rollover_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "term_deposit_id" UUID NOT NULL,
    "cycle_number" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL,
    "interest_earned" DECIMAL(18,2) NOT NULL,
    "action_taken" "TermDepositRolloverMethod" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "term_deposit_rollover_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "term_deposits_wallet_id_key" ON "term_deposits"("wallet_id");

-- CreateIndex
CREATE INDEX "term_deposits_user_id_status_idx" ON "term_deposits"("user_id", "status");

-- CreateIndex
CREATE INDEX "term_deposits_user_id_maturity_date_idx" ON "term_deposits"("user_id", "maturity_date");

-- CreateIndex
CREATE INDEX "term_deposits_status_maturity_date_idx" ON "term_deposits"("status", "maturity_date");

-- CreateIndex
CREATE INDEX "term_deposit_rollover_logs_term_deposit_id_idx" ON "term_deposit_rollover_logs"("term_deposit_id");

-- AddForeignKey
ALTER TABLE "term_deposits" ADD CONSTRAINT "term_deposits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_deposits" ADD CONSTRAINT "term_deposits_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_deposits" ADD CONSTRAINT "term_deposits_target_wallet_id_fkey" FOREIGN KEY ("target_wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "term_deposit_rollover_logs" ADD CONSTRAINT "term_deposit_rollover_logs_term_deposit_id_fkey" FOREIGN KEY ("term_deposit_id") REFERENCES "term_deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
