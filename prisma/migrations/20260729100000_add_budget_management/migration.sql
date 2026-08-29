-- Add explicit budget scopes, cycle metadata, alert configuration, and archival.
CREATE TYPE "BudgetType" AS ENUM ('OVERALL', 'CATEGORY');
CREATE TYPE "BudgetPeriod" AS ENUM ('CUSTOM', 'WEEKLY', 'MONTHLY', 'YEARLY');

ALTER TABLE "budgets"
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18, 2)
USING "amount"::DECIMAL(18, 2),
ALTER COLUMN "category_id" DROP NOT NULL,
ADD COLUMN "type" "BudgetType" NOT NULL DEFAULT 'CATEGORY',
ADD COLUMN "period" "BudgetPeriod" NOT NULL DEFAULT 'CUSTOM',
ADD COLUMN "alert_threshold" DECIMAL(5, 2) NOT NULL DEFAULT 80,
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

-- Keep historical budgets when a category is referenced.
ALTER TABLE "budgets"
DROP CONSTRAINT "budgets_category_id_fkey",
ADD CONSTRAINT "budgets_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "categories"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "budgets"
ADD CONSTRAINT "budgets_amount_positive_check"
CHECK ("amount" > 0),
ADD CONSTRAINT "budgets_date_range_check"
CHECK ("end_date" > "start_date"),
ADD CONSTRAINT "budgets_alert_threshold_check"
CHECK ("alert_threshold" > 0 AND "alert_threshold" <= 100),
ADD CONSTRAINT "budgets_scope_category_check"
CHECK (
  ("type" = 'OVERALL' AND "category_id" IS NULL)
  OR ("type" = 'CATEGORY' AND "category_id" IS NOT NULL)
);

CREATE INDEX "budgets_category_id_idx"
ON "budgets"("category_id");

CREATE INDEX "budgets_user_id_is_archived_idx"
ON "budgets"("user_id", "is_archived");

CREATE INDEX "budgets_user_id_start_date_end_date_idx"
ON "budgets"("user_id", "start_date", "end_date");

CREATE INDEX "budgets_user_id_type_period_idx"
ON "budgets"("user_id", "type", "period");
