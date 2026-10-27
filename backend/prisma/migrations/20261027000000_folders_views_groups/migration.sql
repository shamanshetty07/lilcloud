-- CreateEnum
CREATE TYPE "GroupRole" AS ENUM ('admin', 'member');

-- AlterTable
ALTER TABLE "files" ADD COLUMN     "folder_id" UUID;

-- CreateTable
CREATE TABLE "folders" (
    "folder_id" UUID NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "parent_folder_id" UUID,
    "folder_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("folder_id")
);

-- CreateTable
CREATE TABLE "file_view_history" (
    "view_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_view_history_pkey" PRIMARY KEY ("view_id")
);

-- CreateTable
CREATE TABLE "storage_groups" (
    "group_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id","user_id")
);

-- CreateTable
CREATE TABLE "group_files" (
    "group_file_id" SERIAL NOT NULL,
    "group_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "shared_by" INTEGER NOT NULL,
    "shared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_files_pkey" PRIMARY KEY ("group_file_id")
);

-- CreateIndex
CREATE INDEX "folders_owner_id_parent_folder_id_idx" ON "folders"("owner_id", "parent_folder_id");

-- CreateIndex
CREATE INDEX "file_view_history_user_id_viewed_at_idx" ON "file_view_history"("user_id", "viewed_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "file_view_history_user_id_file_id_key" ON "file_view_history"("user_id", "file_id");

-- CreateIndex
CREATE INDEX "storage_groups_created_by_idx" ON "storage_groups"("created_by");

-- CreateIndex
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

-- CreateIndex
CREATE INDEX "group_files_file_id_idx" ON "group_files"("file_id");

-- CreateIndex
CREATE INDEX "group_files_group_id_shared_at_idx" ON "group_files"("group_id", "shared_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "group_files_group_id_file_id_key" ON "group_files"("group_id", "file_id");

-- CreateIndex
CREATE INDEX "files_owner_id_folder_id_idx" ON "files"("owner_id", "folder_id");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("folder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "folders"("folder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_view_history" ADD CONSTRAINT "file_view_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_view_history" ADD CONSTRAINT "file_view_history_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_groups" ADD CONSTRAINT "storage_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "storage_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_files" ADD CONSTRAINT "group_files_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "storage_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_files" ADD CONSTRAINT "group_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_files" ADD CONSTRAINT "group_files_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Folder names are unique among siblings per owner, ignoring case.
-- Two partial indexes because NULL parents compare as distinct in a plain unique index.
CREATE UNIQUE INDEX "folders_owner_parent_name_key" ON "folders"("owner_id", "parent_folder_id", lower("folder_name")) WHERE "parent_folder_id" IS NOT NULL;
CREATE UNIQUE INDEX "folders_owner_root_name_key" ON "folders"("owner_id", lower("folder_name")) WHERE "parent_folder_id" IS NULL;

-- A folder can never be its own parent (deeper cycles are rejected by the service layer).
ALTER TABLE "folders" ADD CONSTRAINT "folders_not_own_parent" CHECK ("parent_folder_id" IS NULL OR "parent_folder_id" <> "folder_id");
