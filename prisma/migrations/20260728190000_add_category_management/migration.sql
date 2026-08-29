-- Category records with a NULL user_id are shared system defaults.
ALTER TABLE "categories"
ALTER COLUMN "user_id" DROP NOT NULL,
ADD COLUMN "parent_id" UUID,
ADD COLUMN "icon" TEXT,
ADD COLUMN "color" TEXT,
ADD COLUMN "is_system" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "is_archived" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "categories"
ADD CONSTRAINT "categories_parent_id_fkey"
FOREIGN KEY ("parent_id") REFERENCES "categories"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "categories"
ADD CONSTRAINT "categories_system_owner_check"
CHECK (
  ("is_system" = true AND "user_id" IS NULL)
  OR ("is_system" = false AND "user_id" IS NOT NULL)
);

CREATE UNIQUE INDEX "categories_system_name_type_ci_key"
ON "categories"(LOWER("name"), "type")
WHERE "is_system" = true;

CREATE UNIQUE INDEX "categories_user_name_type_ci_key"
ON "categories"("user_id", LOWER("name"), "type")
WHERE "is_system" = false;

CREATE INDEX "categories_user_id_is_archived_idx"
ON "categories"("user_id", "is_archived");

CREATE INDEX "categories_type_is_archived_idx"
ON "categories"("type", "is_archived");

CREATE INDEX "categories_parent_id_idx"
ON "categories"("parent_id");

DROP INDEX IF EXISTS "categories_user_id_idx";
