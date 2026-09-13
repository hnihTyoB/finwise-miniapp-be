-- Add zalo_bot_chat_id to notification_settings for Zalo Bot delivery
ALTER TABLE "notification_settings" ADD COLUMN IF NOT EXISTS "zalo_bot_chat_id" VARCHAR(100);
