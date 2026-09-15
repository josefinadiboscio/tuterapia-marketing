import type { Connection, RowDataPacket } from "mysql2/promise";
import { monthRangeUtc, PRIMERA_SESION, type Pais } from "./shared";

/**
 * Pacientes nuevos: patients whose FIRST realized session falls in the month
 * (METRICAS.md §6). They belong to the month of the session, not of their
 * registration — a patient who signed up in March and started in May is new
 * in May.
 */
export async function pacientesNuevos(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<number> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n
       FROM (${PRIMERA_SESION}) f
       JOIN login l ON l.id = f.id_paciente AND l.tipo = 1
      WHERE l.paisDominio = ?
        AND f.primera >= ? AND f.primera < ?`,
    [pais, start, end],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Pacientes activos: at least one realized session in the month. */
export async function pacientesActivos(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<number> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(DISTINCT s.id_paciente) AS n
       FROM sesiones s
       JOIN login l ON l.id = s.id_paciente AND l.tipo = 1
      WHERE s.realizada = 1 AND l.paisDominio = ?
        AND s.fecha >= ? AND s.fecha < ?`,
    [pais, start, end],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Churn: share of a month's active patients who had no session the following
 * month. Stored on the row of the FOLLOWING month, which is the month where
 * the number becomes knowable — that keeps it inside the job's write window
 * instead of needing a recalculation of a closed month.
 *
 * Reading the row for month N: "of the patients active in N-1, this share did
 * not come back in N".
 */
export async function churn(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<{ activos_mes_previo: number; perdidos: number }> {
  const actual = monthRangeUtc(mes);
  const [year, month] = mes.split("-").map(Number);
  const previo = monthRangeUtc(
    `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}`,
  );

  const [rows] = await conn.query<
    (RowDataPacket & { activos_mes_previo: number; perdidos: number })[]
  >(
    `SELECT COUNT(*) AS activos_mes_previo,
            SUM(vuelve.id_paciente IS NULL) AS perdidos
       FROM (
         SELECT DISTINCT s.id_paciente
           FROM sesiones s
           JOIN login l ON l.id = s.id_paciente AND l.tipo = 1
          WHERE s.realizada = 1 AND l.paisDominio = ?
            AND s.fecha >= ? AND s.fecha < ?
       ) previo
       LEFT JOIN (
         SELECT DISTINCT id_paciente
           FROM sesiones
          WHERE realizada = 1 AND fecha >= ? AND fecha < ?
       ) vuelve ON vuelve.id_paciente = previo.id_paciente`,
    [pais, previo.start, previo.end, actual.start, actual.end],
  );

  return {
    activos_mes_previo: Number(rows[0]?.activos_mes_previo ?? 0),
    perdidos: Number(rows[0]?.perdidos ?? 0),
  };
}
