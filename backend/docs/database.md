# Database

Postgres via Prisma (`prisma/schema.prisma`, migrations in `prisma/migrations`). File *content* is not in the
database: it lives in the storage backend under the file's uuid (`src/files/storage.ts`). Activity and auth logs
live in MongoDB and are not part of this schema.

## ER diagram

```mermaid
erDiagram
    users ||--o{ files : owns
    users ||--o{ folders : owns
    folders ||--o{ folders : "parent of"
    folders |o--o{ files : contains
    files ||--o{ file_permissions : "granted via"
    users ||--o{ file_permissions : holds
    users ||--o{ file_view_history : viewed
    files ||--o{ file_view_history : "viewed in"
    users ||--o{ storage_groups : created
    storage_groups ||--o{ group_members : has
    users ||--o{ group_members : "member of"
    storage_groups ||--o{ group_files : shares
    files ||--o{ group_files : "shared in"
    users ||--o{ group_files : "shared by"

    users { int user_id PK }
    files { uuid file_id PK
            int owner_id FK
            uuid folder_id FK "null = root" }
    folders { uuid folder_id PK
              int owner_id FK
              uuid parent_folder_id FK "null = root"
              text folder_name }
    file_view_history { int view_id PK
                        int user_id FK
                        uuid file_id FK
                        timestamp viewed_at }
    storage_groups { uuid group_id PK
                     text group_name
                     int created_by FK }
    group_members { uuid group_id PK,FK
                    int user_id PK,FK
                    enum role "admin|member"
                    timestamp joined_at }
    group_files { int group_file_id PK
                  uuid group_id FK
                  uuid file_id FK
                  int shared_by FK
                  timestamp shared_at }
```

## Folders

- `files.folder_id` is nullable: existing files and root-level uploads have `NULL`.
- Sibling names are unique **per owner, case-insensitively** (policy: a second "Photos" in the same place is a 409).
  Enforced by two partial unique indexes written by hand in the migration (`folders_owner_parent_name_key`,
  `folders_owner_root_name_key`), because Prisma cannot express `lower(name)` or the nullable-parent case. Prisma
  does not manage these, so keep them when editing that migration. File names are not unique, as before.
- `folders_not_own_parent` is a CHECK against a folder being its own parent. Longer cycles are rejected by the
  service (moves run under a per-owner advisory lock so two concurrent moves cannot create one).
- Foreign keys to parent/owner/files are `RESTRICT`; deleting a folder is done by the service, which removes the
  whole subtree (deepest first) and its files in one transaction, then the stored blobs.

## Recently viewed

`file_view_history` has one row per `(user_id, file_id)` (unique), `viewed_at` is bumped on every explicit open.
Index `(user_id, viewed_at DESC)` serves the list. Rows cascade away when the file or user is deleted. Listing also
filters on *current* read access, so files you lost access to disappear without deleting history.

## Groups

- `group_members` has composite PK `(group_id, user_id)`: no duplicate memberships. Index on `user_id`.
- `group_files` links an existing `files` row to a group, unique on `(group_id, file_id)`. One file can be in many
  groups and no content is copied. Group uploads create a normal file owned by the uploader (so it counts toward
  *their* quota) plus the link, in one transaction.
- Group membership grants **READ only**. Delete/ownership still come from `files.owner_id` / `file_permissions`.
- Removing a member deletes only their `group_members` row; files they shared stay linked. Deleting a group
  cascades to its members and links, never to the files.
- Rules enforced in the service (under a per-group advisory lock): at least one admin must remain; only admins add,
  remove, promote or demote others; any member can leave.
