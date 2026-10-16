-- CreateEnum
CREATE TYPE "WalletMemberRole" AS ENUM ('OWNER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "WalletMemberStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'LEFT');

-- CreateEnum
CREATE TYPE "WalletInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_INVITE_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_INVITE_ACCEPTED';
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_MEMBER_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_TRANSACTION_ALERT';
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_MEMBER_REMOVED';
ALTER TYPE "NotificationType" ADD VALUE 'SHARED_WALLET_LIMIT_EXCEEDED';

-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "wallet_id" UUID;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "is_shared" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "wallet_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "wallet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "WalletMemberRole" NOT NULL DEFAULT 'MEMBER',
    "nickname" VARCHAR(50),
    "monthly_spending_limit" DECIMAL(18,2),
    "status" "WalletMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallet_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_invitations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v7(),
    "wallet_id" UUID NOT NULL,
    "inviter_id" UUID NOT NULL,
    "role" "WalletMemberRole" NOT NULL DEFAULT 'MEMBER',
    "invite_code" VARCHAR(32) NOT NULL,
    "status" "WalletInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_by" UUID,
    "accepted_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallet_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_members_user_id_status_idx" ON "wallet_members"("user_id", "status");

-- CreateIndex
CREATE INDEX "wallet_members_wallet_id_status_idx" ON "wallet_members"("wallet_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_members_wallet_id_user_id_key" ON "wallet_members"("wallet_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_invitations_invite_code_key" ON "wallet_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "wallet_invitations_invite_code_idx" ON "wallet_invitations"("invite_code");

-- CreateIndex
CREATE INDEX "wallet_invitations_wallet_id_status_idx" ON "wallet_invitations"("wallet_id", "status");

-- CreateIndex
CREATE INDEX "budgets_wallet_id_idx" ON "budgets"("wallet_id");

-- CreateIndex
CREATE INDEX "wallets_is_shared_is_archived_idx" ON "wallets"("is_shared", "is_archived");

-- AddForeignKey
ALTER TABLE "wallet_members" ADD CONSTRAINT "wallet_members_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_members" ADD CONSTRAINT "wallet_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_invitations" ADD CONSTRAINT "wallet_invitations_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_invitations" ADD CONSTRAINT "wallet_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_invitations" ADD CONSTRAINT "wallet_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
