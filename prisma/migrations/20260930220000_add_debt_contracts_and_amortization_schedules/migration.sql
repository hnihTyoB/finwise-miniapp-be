-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('DEBT_PAYABLE', 'LOAN_RECEIVABLE');

-- CreateEnum
CREATE TYPE "AmortizationMethod" AS ENUM ('REDUCING_BALANCE', 'FIXED_ANNUITY', 'INTEREST_ONLY');

-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('DRAFT', 'ACTIVE', 'OVERDUE', 'COMPLETED', 'DEFAULTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DebtScheduleStatus" AS ENUM ('SCHEDULED', 'UPCOMING', 'DUE', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'WAIVED');

-- AlterEnum
ALTER TYPE "NotificationSourceType" ADD VALUE 'DEBT';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DEBT_PAYMENT_DUE';

-- CreateTable
CREATE TABLE "debt_contracts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "user_id" UUID NOT NULL,
    "wallet_id" UUID,
    "name" VARCHAR(255) NOT NULL,
    "counterparty" VARCHAR(255) NOT NULL,
    "type" "DebtType" NOT NULL,
    "method" "AmortizationMethod" NOT NULL,
    "status" "DebtStatus" NOT NULL DEFAULT 'ACTIVE',
    "principal" DECIMAL(18,2) NOT NULL,
    "remaining_principal" DECIMAL(18,2) NOT NULL,
    "annual_interest_rate" DECIMAL(5,2) NOT NULL,
    "term_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "debt_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_schedule_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "debt_contract_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "period" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_due" DECIMAL(18,2) NOT NULL,
    "interest_due" DECIMAL(18,2) NOT NULL,
    "total_due" DECIMAL(18,2) NOT NULL,
    "principal_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "interest_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remaining_principal" DECIMAL(18,2) NOT NULL,
    "status" "DebtScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "paid_at" TIMESTAMPTZ(3),
    "transaction_id" UUID,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "debt_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_contracts_user_id_status_is_archived_idx" ON "debt_contracts"("user_id", "status", "is_archived");

-- CreateIndex
CREATE INDEX "debt_contracts_user_id_type_idx" ON "debt_contracts"("user_id", "type");

-- CreateIndex
CREATE INDEX "debt_contracts_wallet_id_idx" ON "debt_contracts"("wallet_id");

-- CreateIndex
CREATE INDEX "debt_schedule_items_user_id_status_due_date_idx" ON "debt_schedule_items"("user_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "debt_schedule_items_debt_contract_id_due_date_idx" ON "debt_schedule_items"("debt_contract_id", "due_date");

-- CreateIndex
CREATE INDEX "debt_schedule_items_transaction_id_idx" ON "debt_schedule_items"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "debt_schedule_items_debt_contract_id_period_key" ON "debt_schedule_items"("debt_contract_id", "period");

-- AddForeignKey
ALTER TABLE "debt_contracts" ADD CONSTRAINT "debt_contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_contracts" ADD CONSTRAINT "debt_contracts_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_schedule_items" ADD CONSTRAINT "debt_schedule_items_debt_contract_id_fkey" FOREIGN KEY ("debt_contract_id") REFERENCES "debt_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_schedule_items" ADD CONSTRAINT "debt_schedule_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_schedule_items" ADD CONSTRAINT "debt_schedule_items_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
