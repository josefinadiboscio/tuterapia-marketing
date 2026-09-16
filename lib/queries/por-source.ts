import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  LOCAL_UTC_OFFSET_HOURS,
  PRIMER_PAGO,
  VENTANA_CONVERSION_DIAS,
  monthRangeUtc,
  type Pais,
  type Rango,
} from "./shared";

/**
 * Everything broken down by raw `utm_source`, monthly and daily.
 *
 * The mapping to a platform lives in Supabase (marketing.utm_mapping) and is
 * applied when reading, never here: a mapping fixed today should change what
 * yesterday's rows are grouped under, and it cannot do that if the grouping
 * was baked in at write time.
 *
 * **Attribution.** A patient's source is the one on their own registration,
 * which is the only one the database records. So a patient who signed up in
 * June through Meta and paid in August counts as an August sale attributed to
 * Meta. The alternative — attributing the sale to the month's traffic — would
 * credit whatever ran the week they happened to pay.
 *
 * An empty or null utm_source comes back as '' and is mapped to the fixed
 * "Sin utm" bucket on read, so traffic without a tag is never dropped.
 */

const DIA_LOCAL_REGISTRO = `DATE(DATE_SUB(l.creacion, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR))`;
const SOURCE = `COALESCE(l.utm_source, '')`;

export type PorSource = { utm_source: string; n: number };
export type ConversionSource = {
  utm_source: string;
  registros: number;
  convertidos: number;
};

/** Patients whose first confirmed payment falls in the month, by their source. */
export async function pacientesNuevosPorSource(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<PorSource[]> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { utm_source: string; n: number })[]
  >(
    `SELECT ${SOURCE} AS utm_source, COUNT(*) AS n
       FROM (${PRIMER_PAGO}) f
       JOIN login l ON l.id = f.id_paciente AND l.tipo = 1
      WHERE l.paisDominio = ? AND f.primera >= ? AND f.primera < ?
      GROUP BY ${SOURCE}`,
    [pais, start, end],
  );
  return rows.map((r) => ({ utm_source: r.utm_source, n: Number(r.n) }));
}

/**
 * Conversion by cohort of registration month, by source: of the people who
 * signed up that month through that source, how many bought within 30 days.
 *
 * Same window and same event as the headline conversion, so a platform's rate
 * and the country's rate are the same measurement at different grains.
 */
export async function conversionPorSource(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<ConversionSource[]> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & {
      utm_source: string;
      registros: number;
      convertidos: number;
    })[]
  >(
    `SELECT ${SOURCE} AS utm_source, COUNT(*) AS registros,
            SUM(p.primera IS NOT NULL
                AND p.primera < DATE_ADD(l.creacion, INTERVAL ${VENTANA_CONVERSION_DIAS} DAY))
              AS convertidos
       FROM login l
       LEFT JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY ${SOURCE}`,
    [pais, start, end],
  );
  return rows.map((r) => ({
    utm_source: r.utm_source,
    registros: Number(r.registros),
    convertidos: Number(r.convertidos ?? 0),
  }));
}

/** Patients with at least one realized session in the month, by their source. */
export async function pacientesActivosPorSource(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<PorSource[]> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { utm_source: string; n: number })[]
  >(
    `SELECT ${SOURCE} AS utm_source, COUNT(DISTINCT s.id_paciente) AS n
       FROM sesiones s
       JOIN login l ON l.id = s.id_paciente AND l.tipo = 1
      WHERE s.realizada = 1 AND l.paisDominio = ?
        AND s.fecha >= ? AND s.fecha < ?
      GROUP BY ${SOURCE}`,
    [pais, start, end],
  );
  return rows.map((r) => ({ utm_source: r.utm_source, n: Number(r.n) }));
}

export type PorDiaSource = { dia: string; utm_source: string; n: number };

/** Daily equivalent of pacientesNuevosPorSource, for the 45-day grain. */
export async function pacientesNuevosPorDiaYSource(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<PorDiaSource[]> {
  const [rows] = await conn.query<
    (RowDataPacket & { dia: string; utm_source: string; n: number })[]
  >(
    `SELECT DATE(DATE_SUB(f.primera, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR)) AS dia,
            ${SOURCE} AS utm_source, COUNT(*) AS n
       FROM (${PRIMER_PAGO}) f
       JOIN login l ON l.id = f.id_paciente AND l.tipo = 1
      WHERE l.paisDominio = ? AND f.primera >= ? AND f.primera < ?
      GROUP BY dia, ${SOURCE} ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({
    dia: String(r.dia),
    utm_source: r.utm_source,
    n: Number(r.n),
  }));
}

/** Daily equivalent of pacientesActivosPorSource. */
export async function pacientesActivosPorDiaYSource(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<PorDiaSource[]> {
  const [rows] = await conn.query<
    (RowDataPacket & { dia: string; utm_source: string; n: number })[]
  >(
    `SELECT DATE(DATE_SUB(s.fecha, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR)) AS dia,
            ${SOURCE} AS utm_source, COUNT(DISTINCT s.id_paciente) AS n
       FROM sesiones s
       JOIN login l ON l.id = s.id_paciente AND l.tipo = 1
      WHERE s.realizada = 1 AND l.paisDominio = ?
        AND s.fecha >= ? AND s.fecha < ?
      GROUP BY dia, ${SOURCE} ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({
    dia: String(r.dia),
    utm_source: r.utm_source,
    n: Number(r.n),
  }));
}

/** Daily conversion cohort by registration day and source. */
export async function conversionPorDiaYSource(
  conn: Connection,
  rango: Rango,
  pais: Pais,
): Promise<{ dia: string; utm_source: string; registros: number; convertidos: number }[]> {
  const [rows] = await conn.query<
    (RowDataPacket & {
      dia: string;
      utm_source: string;
      registros: number;
      convertidos: number;
    })[]
  >(
    `SELECT ${DIA_LOCAL_REGISTRO} AS dia, ${SOURCE} AS utm_source,
            COUNT(*) AS registros,
            SUM(p.primera IS NOT NULL
                AND p.primera < DATE_ADD(l.creacion, INTERVAL ${VENTANA_CONVERSION_DIAS} DAY))
              AS convertidos
       FROM login l
       LEFT JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY dia, ${SOURCE} ORDER BY dia`,
    [pais, rango.start, rango.end],
  );
  return rows.map((r) => ({
    dia: String(r.dia),
    utm_source: r.utm_source,
    registros: Number(r.registros),
    convertidos: Number(r.convertidos ?? 0),
  }));
}

/**
 * How many of a registration cohort ever bought, with no window.
 *
 * Different from conversion_cohorte on purpose. That one asks how many bought
 * within thirty days, which is a question about speed and belongs on General.
 * The funnel asks how far the cohort got, with no clock: someone who signed up
 * in April and paid in July is a buyer who reached a first session, and
 * counting them at the session stage but not at the purchase stage drew a
 * funnel whose second stage was larger than its first.
 */
export async function compradoresDeCohorte(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<number> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
    `SELECT COUNT(*) AS n
       FROM login l
       JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?`,
    [pais, start, end],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * How many patients of a registration cohort reached their nth realized
 * session, counted to 12.
 *
 * Cumulative by construction: someone who did six sessions is counted in rows
 * one through six, so the drop between two steps is a plain division.
 *
 * Sessions are counted over the patient's whole life, not inside a window. A
 * young cohort therefore has no rows for the later sessions, which is the
 * truth — not a zero — and the grid draws those cells dotted.
 */
export async function cohorteSesiones(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<{ cohorteN: number; porSesion: { nro: number; pacientes: number }[] }> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { sesiones: number; pacientes: number })[]
  >(
    `SELECT COALESCE(s.total, 0) AS sesiones, COUNT(*) AS pacientes
       FROM login l
       LEFT JOIN (SELECT id_paciente, COUNT(*) AS total
                    FROM sesiones WHERE realizada = 1
                   GROUP BY id_paciente) s ON s.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY COALESCE(s.total, 0)`,
    [pais, start, end],
  );

  const cohorteN = rows.reduce((a, r) => a + Number(r.pacientes), 0);

  // Reaching session n means having done at least n, so each row is the tail
  // of the distribution from n upwards.
  const porSesion = Array.from({ length: 12 }, (_, i) => {
    const nro = i + 1;
    const pacientes = rows
      .filter((r) => Number(r.sesiones) >= nro)
      .reduce((a, r) => a + Number(r.pacientes), 0);
    return { nro, pacientes };
  });

  return { cohorteN, porSesion };
}
