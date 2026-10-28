# Redis caching

Optional response cache in front of Postgres (`src/cache/`). **Without `REDIS_URL` nothing changes**: every read goes to
the database. If Redis is configured but unreachable the api keeps serving from the database.

## Setup

```bash
# local redis (there is no docker-compose in this repo, so this is a one-liner). bound to loopback only:
# an unauthenticated redis must never be reachable from the network
docker ps -a --filter name=lilcloud-redis     # already there? then `docker start lilcloud-redis` instead
docker run -d --name lilcloud-redis -p 127.0.0.1:6379:6379 redis:7-alpine
docker exec lilcloud-redis redis-cli ping     # PONG
```

In `backend/.env` (never commit it):

```
REDIS_URL="redis://localhost:6379"      # rediss://... for TLS providers such as Upstash
# REDIS_KEY_PREFIX="lilcloud"           # change it if several environments share one redis
```

`bun run dev` / `bun run start` connect on startup (a failed connection is logged, not fatal) and close on SIGINT/SIGTERM.
The client is Bun's built-in `RedisClient`, so there is no extra dependency. Scripting (`EVAL`) must be allowed by the
Redis provider; it is used for the one-round-trip read described below.

Start the backend as usual (`bun run dev`). To see what the cache holds while developing:
`docker exec lilcloud-redis redis-cli --scan --pattern 'lilcloud:*'` (fine by hand, the api itself never enumerates keys).

## What is cached

| Data | Endpoint(s) | TTL | Scope invalidated by |
|---|---|---|---|
| Folder contents, file lists (per folder / root / all) | `GET /folders/:id`, `GET /files` | 60 s | upload, delete, move, folder create / rename / move / delete |
| Usage totals | `GET /files/usage` | 120 s | upload, delete, folder delete |
| Recently viewed (per page) | `GET /files/recent` | 30 s | the user viewing a file, file delete / move, leaving or being removed from a group, unshare, group delete |
| Group metadata, members, group files | `GET /groups/:id`, `/members`, `/files` | 120 s | rename, member add / remove / role change, share / unshare, group upload, shared file move / delete, group delete |

Deliberately **not** cached: file contents and downloads; the auth lookup in `requireAuth` and every ownership /
membership check (`requireMember`, `findAccessibleFile`, ...); the quota check on upload (reads the live total);
`GET /groups` (per-user roles and counts, one indexed query). There is no standalone file-metadata endpoint, the
metadata is cached as part of the listings above.

## How it works

* **Cache-aside with generation keys.** Keys look like `<prefix>:data:<scope>:<version>:<query>`, with the version token
  at `<prefix>:ver:<scope>`. Scopes are `user:<id>:files`, `user:<id>:recent` and `group:<uuid>`; the query part is
  `folder:<id|root>`, `list:<hash>`, `usage`, `page:<hash of limit+cursor>`, `meta`, `members` or `files`. The version
  token and the entry are read in a single round trip (a small read-only `EVAL`), so a hit costs one Redis call. A scope (one user's files, one user's recents, one group)
  has a random version token. Invalidating = writing a new token (one `SET`, no `KEYS`/`SCAN`); old entries become
  unreachable and expire by TTL. The version is read before the database, so a read that races a mutation can only
  write into the dead generation.
* **User and group isolation.** The user id always comes from the verified JWT (`req.userId`), never the request.
  Keys carry the user or group id. Group reads check membership against the database first and only then read the
  cache, so a revoked member gets a 404 immediately even while entries are warm. The role in group responses is added
  per viewer after the cached part.
* **Invalidation happens after commit**, only when the mutation succeeded, so failed mutations leave the cache alone.
* **Failure handling.** Every Redis call has a 250 ms timeout and fails fast (no offline queue); after a failure Redis is
  skipped for 5 s (circuit breaker) while the client reconnects on its own. Reads fall back to the database, writes
  never fail because of the cache, and authorization checks run against the database whether Redis is up or not.
  Errors from the database are never cached. Malformed or wrongly shaped entries are deleted and reloaded.
  Redis errors are logged without connection details.

## Consistency guarantees (and their limits)

* Read-your-writes for the acting user, and immediate effect of membership / sharing revocations on every cached
  endpoint, as long as Redis accepted the invalidation.
* If an invalidation cannot reach Redis, this process stops serving cached data for 120 s (the longest TTL), which is
  the longest any old entry can live. This is per process: with several api instances, run a durable invalidation
  mechanism (for example a transactional outbox drained by a worker) before relying on it. It is not implemented.
* A crash between commit and invalidation leaves entries stale for at most their TTL.
* Bounded staleness by design (<= 30 s): another user's *recents* after the owner moves or deletes a file they viewed.
  Opening such a file is always re-authorised against the database. Changes made directly in SQL (outside the api),
  and `file_permissions` rows (no api manages them) only show up after the TTL.

## Tests

```bash
bun test src/cache/cache.test.ts      # unit tests, no database, in-memory fake redis
TEST_DATABASE_URL=postgresql://... bun test   # adds the HTTP integration suite (src/cache/cache.integration.test.ts)

# against a real, disposable redis (never your dev one: the suite flushes it)
docker run -d --name lilcloud-redis-test -p 127.0.0.1:6380:6379 redis:7-alpine
TEST_REDIS_URL=redis://127.0.0.1:6380 TEST_REDIS_CONTAINER=lilcloud-redis-test \
  TEST_DATABASE_URL=postgresql://... bun test src/cache/cache.redis.test.ts
docker rm -f lilcloud-redis-test
```

`cache.redis.test.ts` needs a loopback `TEST_REDIS_URL`; it checks the real TTL / JSON / key layout, the HTTP flows
and, when `TEST_REDIS_CONTAINER` is set, stops and starts that container to prove fallback and reconnection.
The other cache suites inject `FakeRedis` (`src/test-utils/fake-redis.ts`) and never open a connection. The integration suite
shares the project's rules for `TEST_DATABASE_URL` (local, name contains "test"). It counts the SQL statements that reach
Postgres to prove cache hits skip the database, and covers invalidation, user and group isolation, revocation,
TTL expiry, Redis down and corrupt entries.
