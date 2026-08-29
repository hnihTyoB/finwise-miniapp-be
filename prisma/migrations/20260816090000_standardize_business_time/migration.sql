-- Business calendar fields are stored as PostgreSQL DATE.
-- Existing transaction/goal timestamps are interpreted as UTC instants and
-- converted to their Asia/Ho_Chi_Minh calendar date.
ALTER TABLE "transactions"
  ALTER COLUMN "date" TYPE DATE
  USING (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

ALTER TABLE "budgets"
  ALTER COLUMN "start_date" TYPE DATE
    USING (("start_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date,
  ALTER COLUMN "end_date" TYPE DATE
    USING (
      CASE
        WHEN "period" = 'CUSTOM' THEN
          ((("end_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)
        ELSE
          ((("end_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1)
      END
    );

ALTER TABLE "saving_goals"
  ALTER COLUMN "target_date" TYPE DATE
  USING (("target_date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;

-- TIMESTAMP WITHOUT TIME ZONE values were historically written by Prisma as
-- UTC wall-clock values. Attach UTC explicitly while converting to timestamptz.
ALTER TABLE "users"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "roles"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "wallets"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "categories"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "transactions"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "transfers"
  ALTER COLUMN "transferred_at" TYPE TIMESTAMPTZ(3) USING "transferred_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "budgets"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "saving_goals"
  ALTER COLUMN "completed_at" TYPE TIMESTAMPTZ(3) USING "completed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "saving_contributions"
  ALTER COLUMN "contributed_at" TYPE TIMESTAMPTZ(3) USING "contributed_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "refresh_tokens"
  ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC';
ALTER TABLE "notifications"
  ALTER COLUMN "read_at" TYPE TIMESTAMPTZ(3) USING "read_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "notification_deliveries"
  ALTER COLUMN "next_attempt_at" TYPE TIMESTAMPTZ(3) USING "next_attempt_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "sent_at" TYPE TIMESTAMPTZ(3) USING "sent_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "notification_settings"
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';
ALTER TABLE "reminders"
  ALTER COLUMN "remind_at" TYPE TIMESTAMPTZ(3) USING "remind_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "end_at" TYPE TIMESTAMPTZ(3) USING "end_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "next_trigger_at" TYPE TIMESTAMPTZ(3) USING "next_trigger_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "last_triggered_at" TYPE TIMESTAMPTZ(3) USING "last_triggered_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "created_at" TYPE TIMESTAMPTZ(3) USING "created_at" AT TIME ZONE 'UTC',
  ALTER COLUMN "updated_at" TYPE TIMESTAMPTZ(3) USING "updated_at" AT TIME ZONE 'UTC';

-- These auth/device tables predate the checked-in migration history in some
-- environments. Convert them only where they already exist; their baseline
-- migration remains a separate schema-reconciliation concern.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['user_socials', 'verification_tokens', 'password_reset_tokens', 'user_devices']
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I ALTER COLUMN created_at TYPE TIMESTAMPTZ(3) USING created_at AT TIME ZONE ''UTC''',
        table_name
      );
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE "users"
      ALTER COLUMN "deleted_at" TYPE TIMESTAMPTZ(3) USING "deleted_at" AT TIME ZONE 'UTC';
  END IF;
  IF to_regclass('public.verification_tokens') IS NOT NULL THEN
    ALTER TABLE "verification_tokens"
      ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC';
  END IF;
  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    ALTER TABLE "password_reset_tokens"
      ALTER COLUMN "expires_at" TYPE TIMESTAMPTZ(3) USING "expires_at" AT TIME ZONE 'UTC';
  END IF;
  IF to_regclass('public.user_devices') IS NOT NULL THEN
    ALTER TABLE "user_devices"
      ALTER COLUMN "last_login_at" TYPE TIMESTAMPTZ(3) USING "last_login_at" AT TIME ZONE 'UTC';
  END IF;
END $$;
