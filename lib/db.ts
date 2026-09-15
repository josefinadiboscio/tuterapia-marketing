import { Client } from "pg";

/**
 * Supabase Postgres, reached directly rather than through the REST API: the
 * marketing schema is deliberately not exposed to PostgREST, and a month has
 * to be written inside a real transaction.
 *
 * A fresh client per invocation, through the transaction pooler — serverless
 * functions freeze between invocations, so a long-lived pool leaks sockets.
 */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) throw new Error("Missing env var: SUPABASE_DB_URL");

  const db = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Runs fn inside a transaction, rolling back on any error. */
export async function transaction<T>(
  db: Client,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    const result = await fn();
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}
