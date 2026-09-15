import { Pool, type PoolClient } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as liteDrizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
export interface DB {
  query<T = Record<string, unknown>>(
    query: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(query: string): Promise<unknown>;
  transaction<T>(fn: (db: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
const parameterize = (query: string, params: unknown[]) => {
  const chunks = query.split(/(\$\d+)/g);
  return sql.join(
    chunks.map((s) =>
      /^\$\d+$/.test(s)
        ? sql`${sql.param(params[Number(s.slice(1)) - 1])}`
        : sql.raw(s),
    ),
    sql.raw(""),
  );
};
function wrapPg(client: Pool | PoolClient): DB {
  const orm = drizzle(client);
  return {
    query: async <T>(q: string, p: unknown[] = []) => ({
      rows: (await orm.execute(parameterize(q, p))).rows as T[],
    }),
    exec: (q) => client.query(q),
    transaction: async (fn) => {
      const c = client instanceof Pool ? await client.connect() : client;
      try {
        await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const v = await fn(wrapPg(c));
        await c.query("COMMIT");
        return v;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        if (client instanceof Pool) c.release();
      }
    },
    close: async () => {
      if (client instanceof Pool) await client.end();
    },
  };
}
function wrapLite(client: PGlite): DB {
  const orm = liteDrizzle(client);
  return {
    query: async <T>(q: string, p: unknown[] = []) => ({
      rows: (await orm.execute(parameterize(q, p))).rows as T[],
    }),
    exec: (q) => client.exec(q),
    transaction: (fn) =>
      client.transaction(async (tx) =>
        fn({
          query: (q, p) => tx.query(q, p),
          exec: (q) => tx.exec(q),
          transaction: async (f) => f(wrapLite(client)),
          close: async () => {},
        }),
      ),
    close: () => client.close(),
  };
}
const globalDB = globalThis as unknown as { stitchrDB?: DB };
export function getDB(): DB {
  if (globalDB.stitchrDB) return globalDB.stitchrDB;
  if (process.env.REGISTRY_DRIVER === "pglite")
    return (globalDB.stitchrDB = wrapLite(
      new PGlite(process.env.PGLITE_PATH ?? ".pglite"),
    ));
  if (!process.env.DATABASE_URL) throw new Error("REGISTRY_UNAVAILABLE");
  return (globalDB.stitchrDB = wrapPg(
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      connectionTimeoutMillis: 5000,
    }),
  ));
}
