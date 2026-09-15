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

/** Half-open UTC range [start, end) for a local month given as 'YYYY-MM'. */
export function monthRangeUtc(mes: string): { start: string; end: string } {
  const [year, month] = mes.split("-").map(Number);
  return {
    start: toSqlDatetime(Date.UTC(year, month - 1, 1, LOCAL_UTC_OFFSET_HOURS)),
    end: toSqlDatetime(Date.UTC(year, month, 1, LOCAL_UTC_OFFSET_HOURS)),
  };
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
