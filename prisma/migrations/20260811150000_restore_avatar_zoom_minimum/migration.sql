-- AlterConstraint
ALTER TABLE "users"
DROP CONSTRAINT "users_avatar_zoom_check";

ALTER TABLE "users"
ADD CONSTRAINT "users_avatar_zoom_check" CHECK ("avatar_zoom" BETWEEN 100 AND 300);
