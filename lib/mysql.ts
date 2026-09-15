import mysql from "mysql2/promise";

/**
 * Read-only connection to the production MySQL database (tuterapiaweb).
 *
 * A single short-lived connection per invocation on purpose: serverless
 * functions are frozen between invocations, so a pool would leak sockets.
 * Every query aggregates on the MySQL side — we never pull raw rows.
 */
export async function withMysql<T>(
  fn: (conn: mysql.Connection) => Promise<T>,
): Promise<T> {
  const conn = await mysql.createConnection({
    host: requireEnv("MYSQL_HOST"),
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: requireEnv("MYSQL_USER"),
    password: requireEnv("MYSQL_PASSWORD"),
    database: requireEnv("MYSQL_DATABASE"),
    ssl: process.env.MYSQL_SSL === "true" ? {} : undefined,
    // The whole job has 60s. Fail loudly instead of hanging.
    connectTimeout: 10_000,
    dateStrings: true,
  });

  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}
