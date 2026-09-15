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

  try {
    await db.connect();
  } catch (error) {
    // A malformed connection string fails as a DNS error on a nonsense host,
    // which says nothing. Naming the host it actually parsed points straight
    // at the usual cause: a password with @ or : that was not URL-encoded.
    throw new Error(
      `No se pudo conectar a Postgres (host leido: "${hostDe(connectionString)}"). ` +
        `Si la password tiene caracteres especiales hay que codificarlos. ` +
        `Causa original: ${error instanceof Error ? error.message : error}`,
    );
  }
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/** Host and port of a connection string, with the credentials left out. */
function hostDe(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    return `${url.hostname}:${url.port || "5432"}`;
  } catch {
    return "no se pudo parsear la URL";
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
