import { Client } from "pg";

/**
 * Supabase Postgres, reached directly rather than through the REST API: the
 * marketing schema is deliberately not exposed to PostgREST, and a month has
 * to be written inside a real transaction.
 *
 * A fresh client per invocation, through the pooler — serverless functions
 * freeze between invocations, so a long-lived pool leaks sockets.
 */
export async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = await conectar();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

/**
 * Connects with the first candidate that answers.
 *
 * SUPABASE_DB_URL wins when it is set and parseable. Otherwise the URL is
 * built from SUPABASE_DB_PASSWORD alone: copying a connection string out of
 * the dashboard is where this kept going wrong, and the password is the only
 * part that cannot be derived. The hosts are tried in order because the
 * pooler's prefix (aws-0 or aws-1) depends on the cluster the project landed
 * on, and the direct host is IPv6-only, which not every runtime can reach.
 */
async function conectar(): Promise<Client> {
  const candidatos = candidatosDeConexion();
  if (candidatos.length === 0) {
    throw new Error(
      "Falta SUPABASE_DB_PASSWORD (o SUPABASE_DB_URL) en las variables de entorno",
    );
  }

  const fallas: string[] = [];

  for (const { host, url } of candidatos) {
    const db = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8_000,
    });

    try {
      await db.connect();
      console.log(`[db] conectado por ${host}`);
      return db;
    } catch (error) {
      fallas.push(`${host}: ${error instanceof Error ? error.message : error}`);
      await db.end().catch(() => {});
    }
  }

  throw new Error(`No se pudo conectar a Postgres. ${fallas.join(" | ")}`);
}

function candidatosDeConexion(): { host: string; url: string }[] {
  const explicita = process.env.SUPABASE_DB_URL?.trim();
  if (explicita && esUrlValida(explicita)) {
    return [{ host: new URL(explicita).hostname, url: explicita }];
  }

  const password = process.env.SUPABASE_DB_PASSWORD?.trim();
  const ref = refDelProyecto();
  if (!password || !ref) return [];

  // Encoded here so a password with @ or : cannot break the URL — the exact
  // failure that made the dashboard string unusable.
  const secreto = encodeURIComponent(password);
  const region = process.env.SUPABASE_DB_REGION?.trim() || "us-east-2";

  return [
    poolers(ref, secreto, region, 1),
    poolers(ref, secreto, region, 0),
    {
      host: `db.${ref}.supabase.co`,
      url: `postgresql://postgres:${secreto}@db.${ref}.supabase.co:5432/postgres`,
    },
  ];
}

function poolers(ref: string, secreto: string, region: string, n: number) {
  const host = `aws-${n}-${region}.pooler.supabase.com`;
  return {
    host,
    url: `postgresql://postgres.${ref}:${secreto}@${host}:6543/postgres`,
  };
}

/** The project ref is the subdomain of the public Supabase URL. */
function refDelProyecto(): string | null {
  const explicito = process.env.SUPABASE_PROJECT_REF?.trim();
  if (explicito) return explicito;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url || !esUrlValida(url)) return null;
  return new URL(url).hostname.split(".")[0] ?? null;
}

function esUrlValida(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
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
