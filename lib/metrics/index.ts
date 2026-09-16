import type { DiasHistograma } from "@/lib/queries/shared";

/**
 * Formulas from METRICAS.md §4. They live here and nowhere else: the sync job
 * and the dashboard both import from this file, so a number can never be
 * computed two different ways.
 */

/**
 * Exact percentile over a histogram of days. `p` is a share, so 0.5 is the
 * median and 0.8 the p80. Returns null when the cohort is empty.
 */
export function percentil(histograma: DiasHistograma, p: number): number | null {
  const total = histograma.reduce((acc, row) => acc + row.n, 0);
  if (total === 0) return null;

  const objetivo = total * p;
  let acumulado = 0;
  for (const row of histograma) {
    acumulado += row.n;
    if (acumulado >= objetivo) return row.dias;
  }
  return histograma[histograma.length - 1]!.dias;
}

/**
 * Share of a cohort's conversions that have already happened by day `edad`,
 * read off the measured maturity curve. A 7-day-old cohort holds roughly 64%
 * of its eventual conversions, so its observed rate is divided by that share.
 */
export function porcentajeAcumulado(
  curva: DiasHistograma,
  edadDias: number,
): number {
  const total = curva.reduce((acc, row) => acc + row.n, 0);
  if (total === 0) return 1;

  const hasta = curva
    .filter((row) => row.dias <= edadDias)
    .reduce((acc, row) => acc + row.n, 0);

  return hasta / total;
}

/**
 * Conversion rate for a cohort, projected when the cohort is younger than the
 * 30-day window. A projected value is always flagged so the UI can mark it and
 * show the cohort's real age next to it (METRICAS.md §5).
 */
export function conversion(
  registros: number,
  convertidos: number,
  edadDias: number,
  curva: DiasHistograma,
): { valor: number | null; proyectada: boolean } {
  if (registros === 0) return { valor: null, proyectada: false };

  const observada = convertidos / registros;
  if (edadDias >= 30) return { valor: observada, proyectada: false };

  const capturado = porcentajeAcumulado(curva, edadDias);
  if (capturado <= 0) return { valor: null, proyectada: true };

  return { valor: observada / capturado, proyectada: true };
}

/**
 * CAC: the month's marketing spend over the month's new patients, per country.
 *
 * Both sides are the calendar month — spend is not attributed back to the
 * registration cohort, and the denominator is every new patient, not only the
 * ones whose registration carried a paid utm_source.
 */
export function cac(gastoUsd: number, pacientesNuevos: number): number | null {
  if (pacientesNuevos === 0) return null;
  return gastoUsd / pacientesNuevos;
}

/** Churn: share of last month's active patients who did not come back. */
export function churnRate(
  activosMesPrevio: number,
  perdidos: number,
): number | null {
  if (activosMesPrevio === 0) return null;
  return perdidos / activosMesPrevio;
}

/**
 * Margin in USD left by one session (METRICAS.md §4).
 *
 * `pct_comision` is what the session pays OUT — the therapist's cut — so what
 * the business keeps is the rest. Multiplying by it instead of by its
 * complement took 26% of the price for Argentina and 30% for Uruguay and
 * called that the margin, which put the LTV at roughly a third of what it is.
 *
 * A payment in `U$S` is taken as it is; a payment in `$` is divided by the
 * exchange rate of ITS OWN country, never by `moneda` alone — treating a
 * Uruguayan amount with the Argentine rate is an error of a factor near 12.
 *
 * The rate is the one in force at the date of the payment, so a closed month
 * keeps the margin it had. It is never recomputed with today's rate.
 */
export function margenUsdSesion({
  precioLocal,
  moneda,
  pctComision,
  tipoCambio,
}: {
  precioLocal: number;
  moneda: string;
  pctComision: number;
  tipoCambio: number | null;
}): number | null {
  const retenido = 1 - pctComision;
  if (moneda === "U$S") return precioLocal * retenido;
  if (!tipoCambio) return null;
  return (precioLocal * retenido) / tipoCambio;
}

/**
 * LTV in USD: sessions a patient does, times the dollars a session leaves.
 * Both factors are returned alongside the product — a moving LTV does not say
 * which of the two moved, and they are different levers.
 */
export function ltv(
  sesionesPorPaciente: number | null,
  margenUsd: number | null,
): number | null {
  if (sesionesPorPaciente === null || margenUsd === null) return null;
  return sesionesPorPaciente * margenUsd;
}

/** Age in days of a month's cohort, measured from the first day of the month. */
export function edadCohorteDias(mes: string, hoy = new Date()): number {
  const [year, month] = mes.split("-").map(Number);
  const inicio = Date.UTC(year, month - 1, 1, 3);
  return Math.max(0, Math.floor((hoy.getTime() - inicio) / 86_400_000));
}
