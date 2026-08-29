-- AlterTable
ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "avatar_url" TEXT,
ADD COLUMN "avatar_position_x" SMALLINT NOT NULL DEFAULT 50,
ADD COLUMN "avatar_position_y" SMALLINT NOT NULL DEFAULT 50;

-- AddConstraint
ALTER TABLE "users"
ADD CONSTRAINT "users_avatar_position_x_check" CHECK ("avatar_position_x" BETWEEN 0 AND 100),
ADD CONSTRAINT "users_avatar_position_y_check" CHECK ("avatar_position_y" BETWEEN 0 AND 100);
