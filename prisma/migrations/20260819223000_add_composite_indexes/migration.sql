-- CreateIndex
CREATE INDEX "wallets_user_id_is_archived_idx" ON "wallets"("user_id", "is_archived");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_updated_at_idx" ON "notification_deliveries"("status", "updated_at");
