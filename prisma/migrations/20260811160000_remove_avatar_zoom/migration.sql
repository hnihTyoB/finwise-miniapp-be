-- DropConstraint
ALTER TABLE "users"
DROP CONSTRAINT "users_avatar_zoom_check";

-- AlterTable
ALTER TABLE "users"
DROP COLUMN "avatar_zoom";
