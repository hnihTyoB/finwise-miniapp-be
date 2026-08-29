-- Keep budget utilization currency-safe. Existing budgets use the project's
-- historical default currency and can be updated explicitly after deployment.
ALTER TABLE "budgets"
ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'VND';

CREATE INDEX "budgets_user_id_currency_start_date_end_date_idx"
ON "budgets"("user_id", "currency", "start_date", "end_date");
