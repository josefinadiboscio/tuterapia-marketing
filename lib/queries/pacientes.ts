import type { Connection, RowDataPacket } from "mysql2/promise";
import { monthRangeUtc, PRIMER_PAGO, type Pais, type Rango } from "./shared";

/**
 * Pacientes nuevos: patients whose FIRST confirmed payment falls in the month.
 * The sale is what makes a patient new, not the first session — someone who
 * paid in August and sits down in September is new in August.
 *
 * They belong to the month of the sale, not of their registration: a patient
 * who signed up in March and bought in May is new in May.
 *
 * Measured against the first realized session instead, the number is about 6%
 * lower (576 vs 613 for AR in 2026-08): the gap is the patients who already
 * paid but have not had their first session yet.
 */
export async function pacientesNuevos(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<number> {
  const { start, end } = rango;
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n
       FROM (${PRIMER_PAGO}) f
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
  rango: Rango,
  pais: Pais,
): Promise<number> {
  const { start, end } = rango;
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
