import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  diasLocales,
  LOCAL_UTC_OFFSET_HOURS,
  PRIMER_PAGO,
  VENTANA_CONVERSION_DIAS,
  type Pais,
  type Rango,
} from "./shared";

/**
 * Daily aggregates for Movimientos.
 *
 * Each of these groups by day inside MySQL and comes back with one row per
 * day, never one query per day: 45 days times two countries would be 90 round
 * trips against a job that has 60 seconds.
 *
 * The day is the LOCAL day (UTC-3). On UTC days the evening of one day lands
 * on the next, which would smear the weekend pattern the whole screen is
 * about.
 */
const DIA_LOCAL = `DATE(DATE_SUB(l.creacion, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR))`;

export type PorDia = { dia: string; n: number };

export async function registrosPorDia(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<PorDia[]> {
  const [rows] = await conn.query<(RowDataPacket & { dia: string; n: number })[]>(
    `SELECT ${DIA_LOCAL} AS dia, COUNT(*) AS n
       FROM login l
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY dia ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({ dia: String(r.dia), n: Number(r.n) }));
}

export async function registrosPorDiaYSource(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<{ dia: string; utm_source: string; n: number }[]> {
  const [rows] = await conn.query<
    (RowDataPacket & { dia: string; utm_source: string; n: number })[]
  >(
    `SELECT ${DIA_LOCAL} AS dia, COALESCE(l.utm_source, '') AS utm_source,
            COUNT(*) AS n
       FROM login l
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY dia, utm_source ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({
    dia: String(r.dia),
    utm_source: r.utm_source,
    n: Number(r.n),
  }));
}

/** Patients whose first confirmed payment falls on each day. */
export async function pacientesNuevosPorDia(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<PorDia[]> {
  const [rows] = await conn.query<(RowDataPacket & { dia: string; n: number })[]>(
    `SELECT DATE(DATE_SUB(f.primera, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR)) AS dia,
            COUNT(*) AS n
       FROM (${PRIMER_PAGO}) f
       JOIN login l ON l.id = f.id_paciente AND l.tipo = 1
      WHERE l.paisDominio = ?
        AND f.primera >= ? AND f.primera < ?
      GROUP BY dia ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({ dia: String(r.dia), n: Number(r.n) }));
}

/**
 * Conversion by cohort of registration day: of the people who registered that
 * day, how many bought within 30 days. Same window and same event as the
 * monthly conversion.
 *
 * Almost every day in a 45-day window is younger than 30 days, so most of
 * these are incomplete by construction and the caller projects them.
 */
export async function conversionPorDia(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<{ dia: string; registros: number; convertidos: number }[]> {
  const [rows] = await conn.query<
    (RowDataPacket & { dia: string; registros: number; convertidos: number })[]
  >(
    `SELECT ${DIA_LOCAL} AS dia, COUNT(*) AS registros,
            SUM(p.primera IS NOT NULL
                AND p.primera < DATE_ADD(l.creacion, INTERVAL ${VENTANA_CONVERSION_DIAS} DAY))
              AS convertidos
       FROM login l
       LEFT JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY dia ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({
    dia: String(r.dia),
    registros: Number(r.registros),
    convertidos: Number(r.convertidos ?? 0),
  }));
}

/** Half-open UTC range covering the last `dias` local days, today included. */
export function ultimosDias(dias: number, ahora = new Date()): Rango {
  const local = new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3600_000);
  const hoyLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  const inicio = hoyLocal - (dias - 1) * 86_400_000;
  const fin = hoyLocal + 86_400_000;
  return {
    start: aSql(inicio + LOCAL_UTC_OFFSET_HOURS * 3600_000),
    end: aSql(fin + LOCAL_UTC_OFFSET_HOURS * 3600_000),
  };
}

function aSql(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

export { diasLocales };
