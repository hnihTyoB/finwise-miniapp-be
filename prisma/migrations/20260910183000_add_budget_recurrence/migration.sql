-- CreateEnum
CREATE TYPE "BudgetRolloverMode" AS ENUM ('RESET', 'ROLLOVER_SURPLUS', 'ROLLOVER_DEFICIT', 'ROLLOVER_NET');

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN "is_recurring" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "auto_renew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recurrence_group_id" UUID,
ADD COLUMN "rollover_mode" "BudgetRolloverMode" NOT NULL DEFAULT 'RESET',
ADD COLUMN "rollover_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN "auto_renew_until" DATE,
ADD COLUMN "renewed_at" TIMESTAMPTZ(3),
ADD COLUMN "parent_budget_id" UUID;

-- CreateIndex
CREATE INDEX "budgets_user_id_is_recurring_auto_renew_idx" ON "budgets"("user_id", "is_recurring", "auto_renew");
CREATE INDEX "budgets_recurrence_group_id_start_date_idx" ON "budgets"("recurrence_group_id", "start_date");
CREATE UNIQUE INDEX "budgets_recurrence_group_id_start_date_key" ON "budgets"("recurrence_group_id", "start_date");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_parent_budget_id_fkey" FOREIGN KEY ("parent_budget_id") REFERENCES "budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
