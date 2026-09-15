import type { Connection, RowDataPacket } from "mysql2/promise";
import { monthRangeUtc, PRIMER_PAGO, type Pais } from "./shared";

/**
 * The two factors of the LTV (METRICAS.md §4), kept apart on purpose: how many
 * sessions a patient does, and how many dollars a session leaves. They are
 * different levers, so the dashboard shows both next to the product.
 *
 * Neither query converts to USD. The commission and the exchange rate live in
 * marketing.parametros with their own vigencia, so the conversion happens in
 * lib/metrics once those are read from Supabase — never here.
 */

/**
 * Sessions per patient over a CLOSED cohort: patients who registered in the
 * month AND bought within 90 days, counting the sessions they realized in
 * those same 90 days.
 *
 * The denominator is buyers, the same population CAC divides by, so LTV/CAC
 * compares like with like. Patients with a single session are counted —
 * leaving them out is what inflated the old estimate (§9).
 *
 * Closed at 90 days because an active patient has not finished their cycle,
 * and because a lifetime count always reads higher on older cohorts simply
 * for having had more time. The caller only asks about months older than 90
 * days.
 */
export async function sesionesPorPaciente(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<{ pacientes: number; sesiones: number }> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { pacientes: number; sesiones: number })[]
  >(
    `SELECT COUNT(DISTINCT compradores.id) AS pacientes,
            COUNT(s.id) AS sesiones
       FROM (
         SELECT l.id, l.creacion
           FROM login l
           JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
          WHERE l.tipo = 1 AND l.paisDominio = ?
            AND l.creacion >= ? AND l.creacion < ?
            AND p.primera < DATE_ADD(l.creacion, INTERVAL 90 DAY)
       ) compradores
       LEFT JOIN sesiones s
         ON s.id_paciente = compradores.id
        AND s.realizada = 1
        AND s.fecha < DATE_ADD(compradores.creacion, INTERVAL 90 DAY)`,
    [pais, start, end],
  );
  return {
    pacientes: Number(rows[0]?.pacientes ?? 0),
    sesiones: Number(rows[0]?.sesiones ?? 0),
  };
}

/**
 * Price per session in local currency, for the payments confirmed in the
 * month, split by currency.
 *
 * Split because `moneda` has two values but three real currencies: a `$` is
 * ARS or UYU depending on the country, and the conversion has to cross both
 * (METRICAS.md §2). Payments in `U$S` are taken as they are.
 *
 * Weighted by sessions rather than averaging per-payment prices, so a package
 * of ten weighs ten times a single session. `monto = 0` (promos) and the two
 * rows with `sesiones = 0` are excluded — one is not revenue, the other is a
 * division by zero.
 */
export async function precioPorSesion(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<{ moneda: string; pagos: number; precio_sesion: number }[]> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { moneda: string; pagos: number; precio_sesion: number })[]
  >(
    `SELECT pp.moneda,
            COUNT(*) AS pagos,
            SUM(pp.monto) / SUM(pp.sesiones) AS precio_sesion
       FROM pacientes_pagos pp
       JOIN login l ON l.id = pp.id_paciente AND l.tipo = 1
      WHERE pp.confirmado = 1 AND pp.monto > 0 AND pp.sesiones > 0
        AND l.paisDominio = ?
        AND pp.creacion >= ? AND pp.creacion < ?
      GROUP BY pp.moneda`,
    [pais, start, end],
  );
  return rows.map((r) => ({
    moneda: r.moneda,
    pagos: Number(r.pagos),
    precio_sesion: Number(r.precio_sesion),
  }));
}
