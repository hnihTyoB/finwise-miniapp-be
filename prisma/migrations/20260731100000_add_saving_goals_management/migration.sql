-- Add saving goals and their contribution history.
CREATE TYPE "SavingGoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED');

CREATE TABLE "saving_goals" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "target_amount" DECIMAL(18, 2) NOT NULL,
  "currency" VARCHAR(3) NOT NULL DEFAULT 'VND',
  "target_date" TIMESTAMP(3) NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "color" TEXT,
  "status" "SavingGoalStatus" NOT NULL DEFAULT 'ACTIVE',
  "completed_at" TIMESTAMP(3),
  "is_archived" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "saving_goals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saving_goals_target_amount_positive_check"
    CHECK ("target_amount" > 0),
  CONSTRAINT "saving_goals_currency_format_check"
    CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "saving_goals_completion_check"
    CHECK (
      ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL)
      OR ("status" <> 'COMPLETED' AND "completed_at" IS NULL)
    )
);

CREATE TABLE "saving_contributions" (
  "id" UUID NOT NULL,
  "saving_goal_id" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "contributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "saving_contributions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saving_contributions_amount_positive_check"
    CHECK ("amount" > 0)
);

CREATE INDEX "saving_goals_user_id_is_archived_idx"
ON "saving_goals"("user_id", "is_archived");

CREATE INDEX "saving_goals_user_id_status_idx"
ON "saving_goals"("user_id", "status");

CREATE INDEX "saving_goals_user_id_target_date_idx"
ON "saving_goals"("user_id", "target_date");

CREATE INDEX "saving_contributions_saving_goal_id_contributed_at_idx"
ON "saving_contributions"("saving_goal_id", "contributed_at");

ALTER TABLE "saving_goals"
ADD CONSTRAINT "saving_goals_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "saving_contributions"
ADD CONSTRAINT "saving_contributions_saving_goal_id_fkey"
FOREIGN KEY ("saving_goal_id") REFERENCES "saving_goals"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
