# backend

To install dependencies:

```bash
bun install
```

## Database

PostgreSQL (Neon in production) accessed with raw SQL via the `pg` driver. See [docs/database.md](docs/database.md).

1. Copy `.env.example` to `.env` and set `DATABASE_URL` (for Neon, use the connection string from the Neon console,
   including `sslmode=require`).
2. Apply migrations:

```bash
bun run db:migrate
```

This is safe on an existing database: applied migrations are skipped, and a database previously migrated by Prisma
is detected through `_prisma_migrations`. No tables are dropped.

To run:

```bash
bun run dev
bun run start
```

Tests run against a separate local database whose name contains `test`:

```bash
DATABASE_URL=postgresql://localhost:5432/lilcloud_test bun run db:migrate
TEST_DATABASE_URL=postgresql://localhost:5432/lilcloud_test bun test
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Caching

Optional Redis cache for listings, usage, recents and groups; see [docs/caching.md](docs/caching.md).
Set `REDIS_URL` to enable it, leave it unset to run uncached.
