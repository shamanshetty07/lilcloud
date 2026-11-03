import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const TIMESTAMP_WITHOUT_TZ = 1114;
const INT8 = 20;

pg.types.setTypeParser(TIMESTAMP_WITHOUT_TZ, (value) => new Date(`${value.replace(" ", "T")}Z`));
pg.types.setTypeParser(INT8, (value) => BigInt(value));
pg.defaults.parseInputDatesAsUTC = true;

export type { Db, Tx } from "./query.ts";
export { rows, one, execute } from "./query.ts";
type Tx = pg.PoolClient;

const globalForDb = globalThis as unknown as { pgPool?: pg.Pool };

export const pool =
  globalForDb.pgPool ??
  new pg.Pool({ connectionString });

if (!globalForDb.pgPool) {
  pool.on("error", (err) => console.error("idle database client error:", err));
}

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

export const transaction = async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      broken = rollbackErr as Error;
    }
    throw err;
  } finally {
    client.release(broken);
  }
};

export const closeDb = () => pool.end();
