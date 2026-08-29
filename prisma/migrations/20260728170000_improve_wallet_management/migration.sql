-- DropForeignKey
ALTER TABLE "transactions" DROP CONSTRAINT "transactions_wallet_id_fkey";

-- AlterTable
ALTER TABLE "wallets"
ADD COLUMN "color" TEXT,
ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
ADD COLUMN "description" TEXT,
ADD COLUMN "icon" TEXT,
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "balance" SET DEFAULT 0,
ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18, 2);

-- CreateIndex
CREATE INDEX "wallets_user_id_idx" ON "wallets"("user_id");

-- AddForeignKey
ALTER TABLE "transactions"
ADD CONSTRAINT "transactions_wallet_id_fkey"
FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
