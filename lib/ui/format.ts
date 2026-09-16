/**
 * Number formatting. The numbers are the interface (DESIGN.md), so the rules
 * are one place and every screen uses them: es-UY separators — thousands with
 * a dot, decimals with a comma — consistent decimals inside a metric, and
 * currency always spelled out.
 *
 * A dash is shown for a missing value, never a zero: an empty month and a
 * month with no registrations are different things.
 */
const LOCALE = "es-UY";
export const SIN_DATO = "—";

export function entero(n: number | null | undefined): string {
  if (n === null || n === undefined) return SIN_DATO;
  return n.toLocaleString(LOCALE);
}

export function porcentaje(
  n: number | null | undefined,
  decimales = 1,
): string {
  if (n === null || n === undefined) return SIN_DATO;
  return `${(n * 100).toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}%`;
}

/** Signed, for deltas. The sign carries the meaning when color cannot. */
export function delta(n: number | null | undefined, decimales = 1): string {
  if (n === null || n === undefined) return SIN_DATO;
  const signo = n >= 0 ? "+" : "−";
  return `${signo}${porcentaje(Math.abs(n), decimales)}`;
}

export function usd(n: number | null | undefined, decimales = 0): string {
  if (n === null || n === undefined) return SIN_DATO;
  return `US$ ${n.toLocaleString(LOCALE, {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  })}`;
}

export function dias(n: number | null | undefined): string {
  if (n === null || n === undefined) return SIN_DATO;
  return `${entero(n)} d`;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** '2026-09' as 'septiembre 2026'. */
export function nombreDeMes(mes: string): string {
  const [year, month] = mes.split("-").map(Number);
  return `${MESES[month - 1]} ${year}`;
}

export function fechaHora(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Montevideo",
  });
}

export function fecha(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, {
    dateStyle: "short",
    timeZone: "America/Montevideo",
  });
}
