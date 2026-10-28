# backend

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.5. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## Caching

Optional Redis cache for listings, usage, recents and groups; see [docs/caching.md](docs/caching.md).
Set `REDIS_URL` to enable it, leave it unset to run uncached.
