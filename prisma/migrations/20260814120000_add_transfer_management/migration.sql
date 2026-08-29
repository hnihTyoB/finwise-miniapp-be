-- Add wallet-to-wallet transfers with exact monetary values and ownership-scoped history.
CREATE TABLE "transfers" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "source_wallet_id" UUID NOT NULL,
  "destination_wallet_id" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "note" TEXT,
  "transferred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "transfers_amount_positive_check" CHECK ("amount" > 0),
  CONSTRAINT "transfers_wallets_different_check"
    CHECK ("source_wallet_id" <> "destination_wallet_id")
);

CREATE INDEX "transfers_user_id_idx"
ON "transfers"("user_id");

CREATE INDEX "transfers_source_wallet_id_idx"
ON "transfers"("source_wallet_id");

CREATE INDEX "transfers_destination_wallet_id_idx"
ON "transfers"("destination_wallet_id");

CREATE INDEX "transfers_transferred_at_idx"
ON "transfers"("transferred_at");

CREATE INDEX "transfers_user_id_transferred_at_idx"
ON "transfers"("user_id", "transferred_at");

ALTER TABLE "transfers"
ADD CONSTRAINT "transfers_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transfers"
ADD CONSTRAINT "transfers_source_wallet_id_fkey"
FOREIGN KEY ("source_wallet_id") REFERENCES "wallets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "transfers"
ADD CONSTRAINT "transfers_destination_wallet_id_fkey"
FOREIGN KEY ("destination_wallet_id") REFERENCES "wallets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
