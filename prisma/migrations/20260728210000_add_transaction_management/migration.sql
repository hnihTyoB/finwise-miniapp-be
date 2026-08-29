-- Store transaction money with exact decimal precision and add receipt metadata.
ALTER TABLE "transactions"
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18, 2)
USING "amount"::DECIMAL(18, 2),
ADD COLUMN "receipt_url" TEXT,
ADD COLUMN "location" TEXT;

CREATE INDEX "transactions_user_id_idx"
ON "transactions"("user_id");

CREATE INDEX "transactions_wallet_id_idx"
ON "transactions"("wallet_id");

CREATE INDEX "transactions_category_id_idx"
ON "transactions"("category_id");

CREATE INDEX "transactions_date_idx"
ON "transactions"("date");

CREATE INDEX "transactions_user_id_date_idx"
ON "transactions"("user_id", "date");

CREATE INDEX "transactions_user_id_type_idx"
ON "transactions"("user_id", "type");
