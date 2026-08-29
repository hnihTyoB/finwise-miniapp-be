-- AlterTable
ALTER TABLE "users"
ADD COLUMN "avatar_zoom" SMALLINT NOT NULL DEFAULT 100;

-- AddConstraint
ALTER TABLE "users"
ADD CONSTRAINT "users_avatar_zoom_check" CHECK ("avatar_zoom" BETWEEN 100 AND 300);
