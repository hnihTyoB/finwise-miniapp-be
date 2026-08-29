-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BUDGET_NEAR_LIMIT', 'BUDGET_EXCEEDED', 'SAVING_GOAL_NEAR_TARGET', 'SAVING_GOAL_ACHIEVED', 'SAVING_GOAL_DUE_SOON', 'RECURRING_PAYMENT_DUE', 'UNUSUAL_TRANSACTION', 'USER_REMINDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'ZALO', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "NotificationSourceType" AS ENUM ('BUDGET', 'SAVING_GOAL', 'TRANSACTION', 'REMINDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('GENERAL', 'RECURRING_PAYMENT');

-- CreateEnum
CREATE TYPE "ReminderFrequency" AS ENUM ('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT NOT NULL,
    "channels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"NotificationChannel"[],
    "data" JSONB,
    "action_url" VARCHAR(500),
    "source_type" "NotificationSourceType",
    "source_id" UUID,
    "dedup_key" VARCHAR(255) NOT NULL,
    "read_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notifications_channels_not_empty_check"
      CHECK (cardinality("channels") > 0)
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "failure_reason" VARCHAR(500),
    "provider_message_id" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_deliveries_external_channel_check"
      CHECK ("channel" <> 'IN_APP')
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"NotificationChannel"[],
    "budget_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "saving_goal_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "reminder_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "unusual_txn_alerts_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_settings_channels_not_empty_check"
      CHECK (cardinality("channels") > 0)
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "ReminderType" NOT NULL DEFAULT 'GENERAL',
    "title" VARCHAR(160) NOT NULL,
    "message" TEXT,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "frequency" "ReminderFrequency" NOT NULL DEFAULT 'ONCE',
    "repeat_interval" INTEGER NOT NULL DEFAULT 1,
    "end_at" TIMESTAMP(3),
    "next_trigger_at" TIMESTAMP(3),
    "last_triggered_at" TIMESTAMP(3),
    "action_url" VARCHAR(500),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reminders_repeat_interval_positive_check"
      CHECK ("repeat_interval" > 0),
    CONSTRAINT "reminders_end_at_check"
      CHECK ("end_at" IS NULL OR "end_at" > "remind_at"),
    CONSTRAINT "reminders_once_end_at_check"
      CHECK ("frequency" <> 'ONCE' OR "end_at" IS NULL),
    CONSTRAINT "reminders_active_trigger_check"
      CHECK (NOT "is_active" OR "next_trigger_at" IS NOT NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedup_key_key" ON "notifications"("user_id", "dedup_key");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
CREATE INDEX "notifications_source_type_source_id_idx" ON "notifications"("source_type", "source_id");
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");
CREATE UNIQUE INDEX "notification_settings_user_id_key" ON "notification_settings"("user_id");
CREATE INDEX "reminders_user_id_is_active_next_trigger_at_idx" ON "reminders"("user_id", "is_active", "next_trigger_at");
CREATE INDEX "reminders_next_trigger_at_is_active_idx" ON "reminders"("next_trigger_at", "is_active");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
