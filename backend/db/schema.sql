CREATE TYPE "Role" AS ENUM ('user', 'admin');

CREATE TYPE "GroupRole" AS ENUM ('admin', 'member');

CREATE TYPE "Permission" AS ENUM ('READ', 'WRITE', 'DELETE', 'OWNER');

CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'user',
    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "folders" (
    "folder_id" UUID NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "parent_folder_id" UUID,
    "folder_name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "folders_pkey" PRIMARY KEY ("folder_id"),
    CONSTRAINT "folders_not_own_parent" CHECK ("parent_folder_id" IS NULL OR "parent_folder_id" <> "folder_id")
);

CREATE TABLE "files" (
    "file_id" UUID NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "file_type" TEXT NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "folder_id" UUID,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "files_pkey" PRIMARY KEY ("file_id")
);

CREATE TABLE "file_permissions" (
    "permission_id" SERIAL NOT NULL,
    "file_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "permission" "Permission" NOT NULL,
    CONSTRAINT "file_permissions_pkey" PRIMARY KEY ("permission_id")
);

CREATE TABLE "file_view_history" (
    "view_id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "file_id" UUID NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "file_view_history_pkey" PRIMARY KEY ("view_id")
);

CREATE TABLE "storage_groups" (
    "group_id" UUID NOT NULL,
    "group_name" TEXT NOT NULL,
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "storage_groups_pkey" PRIMARY KEY ("group_id")
);

CREATE TABLE "group_members" (
    "group_id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "GroupRole" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_members_pkey" PRIMARY KEY ("group_id", "user_id")
);

CREATE TABLE "group_files" (
    "group_file_id" SERIAL NOT NULL,
    "group_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "shared_by" INTEGER NOT NULL,
    "shared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "group_files_pkey" PRIMARY KEY ("group_file_id")
);

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE INDEX "files_owner_id_idx" ON "files"("owner_id");
CREATE INDEX "files_owner_id_folder_id_idx" ON "files"("owner_id", "folder_id");
CREATE INDEX "files_owner_deleted_at_idx" ON "files"("owner_id", "deleted_at");

CREATE INDEX "file_permissions_user_id_idx" ON "file_permissions"("user_id");
CREATE UNIQUE INDEX "file_permissions_file_id_user_id_permission_key" ON "file_permissions"("file_id", "user_id", "permission");

CREATE INDEX "folders_owner_id_parent_folder_id_idx" ON "folders"("owner_id", "parent_folder_id");
CREATE INDEX "folders_owner_deleted_at_idx" ON "folders"("owner_id", "deleted_at");
CREATE UNIQUE INDEX "folders_owner_parent_name_key" ON "folders"("owner_id", "parent_folder_id", lower("folder_name")) WHERE "parent_folder_id" IS NOT NULL AND "deleted_at" IS NULL;
CREATE UNIQUE INDEX "folders_owner_root_name_key" ON "folders"("owner_id", lower("folder_name")) WHERE "parent_folder_id" IS NULL AND "deleted_at" IS NULL;

CREATE INDEX "file_view_history_user_id_viewed_at_idx" ON "file_view_history"("user_id", "viewed_at" DESC);
CREATE UNIQUE INDEX "file_view_history_user_id_file_id_key" ON "file_view_history"("user_id", "file_id");

CREATE INDEX "storage_groups_created_by_idx" ON "storage_groups"("created_by");

CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

CREATE INDEX "group_files_file_id_idx" ON "group_files"("file_id");
CREATE INDEX "group_files_group_id_shared_at_idx" ON "group_files"("group_id", "shared_at" DESC);
CREATE UNIQUE INDEX "group_files_group_id_file_id_key" ON "group_files"("group_id", "file_id");

ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "files" ADD CONSTRAINT "files_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "folders"("folder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "file_permissions" ADD CONSTRAINT "file_permissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "folders" ADD CONSTRAINT "folders_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "folders" ADD CONSTRAINT "folders_parent_folder_id_fkey" FOREIGN KEY ("parent_folder_id") REFERENCES "folders"("folder_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "file_view_history" ADD CONSTRAINT "file_view_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "file_view_history" ADD CONSTRAINT "file_view_history_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storage_groups" ADD CONSTRAINT "storage_groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "storage_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_files" ADD CONSTRAINT "group_files_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "storage_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_files" ADD CONSTRAINT "group_files_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("file_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_files" ADD CONSTRAINT "group_files_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
