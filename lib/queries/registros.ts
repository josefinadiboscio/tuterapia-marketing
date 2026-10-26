import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  monthRangeUtc,
  LOCAL_UTC_OFFSET_HOURS,
  type Pais,
  type Rango,
} from "./shared";

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

/**
 * Por mes local, cuántos registros hay y cuántos llegaron a tener terapeuta.
 *
 * Devuelve la ventana entera en UNA consulta y no un mes por llamada, porque
 * esta métrica no se congela como las demás. `pacientes.id_terapeuta` no tiene
 * fecha propia —`modificacion` se mueve con cualquier edición de la fila— así
 * que es un estado de HOY: la cohorte de octubre sigue subiendo durante todo
 * noviembre y recién a las tres o cuatro semanas deja de moverse. Un mes
 * escrito una sola vez y nunca más quedaría clavado en su valor inmaduro.
 *
 * Es el mismo caso que el funnel sobre compradores, que por eso tampoco se
 * congela (METRICAS.md §8), y por eso esta consulta vive al lado de aquella y
 * no adentro del bucle mensual del sync.
 *
 * Se usa `pacientes.id_terapeuta IS NOT NULL` y no `terminarRegistro`, por la
 * regla de METRICAS.md §1: los dos no coinciden —10.697 pacientes tienen el
 * flag en 1 y terapeuta igual— y la columna es la que dice la verdad.
 *
 * El INNER JOIN alcanza: los 127.381 registros tienen fila en `pacientes`,
 * medido sobre trece cohortes. Igual el denominador sale de acá y no de
 * `registros()`, así que los dos lados de la división cuentan exactamente las
 * mismas filas aunque algún día aparezca un registro sin perfil.
 */
export async function registrosYTerapeutaPorMes(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<{ mes: string; registros: number; conTerapeuta: number }[]> {
  const { start, end } = rango;
  // El mes se corta en hora local, como todo el resto (METRICAS.md §1). El
  // rango ya viene corrido, así que el índice sobre `creacion` sigue sirviendo
  // y el DATE_SUB solo decide a qué mes va cada fila ya filtrada.
  const [rows] = await conn.query<
    (RowDataPacket & { mes: string; registros: number; con_terapeuta: number })[]
  >(
    `SELECT DATE_FORMAT(
              DATE_SUB(l.creacion, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR),
              '%Y-%m') AS mes,
            COUNT(*) AS registros,
            SUM(p.id_terapeuta IS NOT NULL) AS con_terapeuta
       FROM login l
       JOIN pacientes p ON p.id_login = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY 1
      ORDER BY 1`,
    [pais, start, end],
  );

  return rows.map((r) => ({
    mes: r.mes,
    registros: Number(r.registros),
    conTerapeuta: Number(r.con_terapeuta),
  }));
}
