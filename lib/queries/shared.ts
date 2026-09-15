/**
 * Shared conventions for every MySQL query.
 *
 * The database stores datetimes in UTC (verified: NOW() equals UTC_TIMESTAMP()),
 * but the business reads months in local time, UTC-3. A registration at 21:30
 * on the 31st is August locally and September in UTC, so every month filter is
 * a UTC range shifted by three hours rather than a conversion per row — that
 * keeps the index on `creacion` usable.
 */
export const LOCAL_UTC_OFFSET_HOURS = 3;

/** Chile is excluded from the whole dashboard (METRICAS.md §1). */
export const PAISES = ["AR", "UY"] as const;
export type Pais = (typeof PAISES)[number];

/** A half-open [start, end) window in UTC, as MySQL datetimes. */
export type Rango = { start: string; end: string };

/** Half-open UTC range for a local month given as 'YYYY-MM'. */
export function monthRangeUtc(mes: string): Rango {
  const [year, month] = mes.split("-").map(Number);
  return {
    start: toSqlDatetime(inicioDeMes(mes)),
    end: toSqlDatetime(Date.UTC(year, month, 1, LOCAL_UTC_OFFSET_HOURS)),
  };
}

/**
 * The first `ms` milliseconds of a month.
 *
 * A month still running is compared against the same stretch of the previous
 * one — fifteen days against fifteen days — because half a month against a
 * whole one reads as a collapse that is not there. Clamped to the month's end
 * so a 31-day stretch does not spill past a shorter month.
 */
export function rangoParcialUtc(mes: string, ms: number): Rango {
  const completo = monthRangeUtc(mes);
  const inicio = inicioDeMes(mes);
  const fin = Math.min(inicio + ms, new Date(`${completo.end}Z`).getTime());
  return { start: completo.start, end: toSqlDatetime(fin) };
}

/** Milliseconds elapsed in a month at a given instant, never negative. */
export function transcurridoEnMes(mes: string, ahora = new Date()): number {
  return Math.max(0, ahora.getTime() - inicioDeMes(mes));
}

function inicioDeMes(mes: string): number {
  const [year, month] = mes.split("-").map(Number);
  return Date.UTC(year, month - 1, 1, LOCAL_UTC_OFFSET_HOURS);
}

function toSqlDatetime(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 19).replace("T", " ");
}

/**
 * First realized session per patient. Used by several queries, always as a
 * derived table so MySQL does the grouping and we never pull the rows.
 */
export const PRIMERA_SESION = `
  SELECT id_paciente, MIN(fecha) AS primera
    FROM sesiones
   WHERE realizada = 1
   GROUP BY id_paciente`;

/** First confirmed payment per patient. A payment is a sale only if confirmado = 1. */
export const PRIMER_PAGO = `
  SELECT id_paciente, MIN(creacion) AS primera
    FROM pacientes_pagos
   WHERE confirmado = 1
   GROUP BY id_paciente`;

/** Histogram row: how many patients converted exactly `dias` days after signing up. */
export type DiasHistograma = { dias: number; n: number }[];
