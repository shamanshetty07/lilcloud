ALTER TABLE "files" ADD COLUMN "deleted_at" TIMESTAMP(3);
ALTER TABLE "folders" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "files_owner_deleted_at_idx" ON "files"("owner_id", "deleted_at");
CREATE INDEX "folders_owner_deleted_at_idx" ON "folders"("owner_id", "deleted_at");

DROP INDEX "folders_owner_parent_name_key";
DROP INDEX "folders_owner_root_name_key";
CREATE UNIQUE INDEX "folders_owner_parent_name_key" ON "folders"("owner_id", "parent_folder_id", lower("folder_name")) WHERE "parent_folder_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "folders_owner_root_name_key" ON "folders"("owner_id", lower("folder_name")) WHERE "parent_folder_id" IS NULL AND "deleted_at" IS NULL;
