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

/**
 * De los registros del mes, cuántos llegaron a tener un terapeuta asignado.
 *
 * `pacientes.id_terapeuta IS NOT NULL` y no `terminarRegistro`, por la regla de
 * METRICAS.md §1: los dos no coinciden —10.697 pacientes tienen el flag en 1 y
 * terapeuta igual— y la columna es la que dice la verdad.
 *
 * Es un INNER JOIN y no un LEFT porque no hace falta: los 127.381 registros
 * tienen fila en `pacientes`, medido (`sin_fila_de_paciente` = 0 en los trece
 * meses del probe). Si algún día dejara de ser cierto, el total de registros
 * seguiría saliendo de `registros()` y esta consulta solo aportaría el
 * numerador, así que un registro sin fila contaría como "sin terapeuta", que
 * es lo que es.
 *
 * Lo que esta consulta NO puede contestar es cuándo lo eligió. La columna no
 * tiene fecha propia y `modificacion` se mueve con cualquier edición de la
 * fila, así que esto es un estado de hoy, no un evento. De ahí sale la regla
 * de madurez: una cohorte tarda unas tres o cuatro semanas en terminar de
 * elegir —medido: a cuatro días de registrarse va en 15–22%, a tres semanas en
 * 42–48%, y los meses cerrados quedan planos en 73–82%— así que el mes en
 * curso no es comparable con los cerrados y hay que decirlo en pantalla.
 */
export async function registrosConTerapeuta(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<number> {
  const { start, end } = rango;
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n
       FROM login l
       JOIN pacientes p ON p.id_login = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
        AND p.id_terapeuta IS NOT NULL`,
    [pais, start, end],
  );
  return Number(rows[0]?.n ?? 0);
}
