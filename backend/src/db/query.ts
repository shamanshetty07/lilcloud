import type pg from "pg";

export type Db = pg.Pool | pg.PoolClient;
export type Tx = pg.PoolClient;

export const rows = async <T extends pg.QueryResultRow>(db: Db, text: string, values: unknown[] = []) =>
  (await db.query<T>(text, values)).rows;

export const one = async <T extends pg.QueryResultRow>(db: Db, text: string, values: unknown[] = []) =>
  (await db.query<T>(text, values)).rows[0] ?? null;

export const execute = async (db: Db, text: string, values: unknown[] = []) =>
  (await db.query(text, values)).rowCount ?? 0;
