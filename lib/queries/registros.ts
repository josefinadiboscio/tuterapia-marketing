import type { Connection, RowDataPacket } from "mysql2/promise";
import { monthRangeUtc, type Pais, type Rango } from "./shared";

/**
 * Registros: rows in `login` with tipo = 1, by month of `creacion`
 * (METRICAS.md §6). tipo = 2 are therapists and never count.
 *
 * `active` is not a filter: every tipo = 1 row has active = 1, only therapist
 * accounts are ever deactivated.
 */
export async function registros(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<number> {
  const { start, end } = rango;
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n
       FROM login
      WHERE tipo = 1 AND paisDominio = ?
        AND creacion >= ? AND creacion < ?`,
    [pais, start, end],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Registros broken down by raw utm_source. The mapping to plataforma lives in
 * Supabase (marketing.utm_mapping), so it is applied after this query, never
 * here — MySQL knows nothing about the mapping table.
 *
 * An empty or null utm_source comes back as '' and becomes the fixed
 * "Sin utm" row, which METRICAS.md §7 requires to stay visible.
 */
export async function registrosPorSource(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<{ utm_source: string; n: number }[]> {
  const { start, end } = rango;
  const [rows] = await conn.query<
    (RowDataPacket & { utm_source: string; n: number })[]
  >(
    `SELECT COALESCE(utm_source, '') AS utm_source, COUNT(*) AS n
       FROM login
      WHERE tipo = 1 AND paisDominio = ?
        AND creacion >= ? AND creacion < ?
      GROUP BY COALESCE(utm_source, '')
      ORDER BY n DESC`,
    [pais, start, end],
  );
  return rows.map((r) => ({ utm_source: r.utm_source, n: Number(r.n) }));
}
