/**
 * The five verdicts of Ads.
 *
 * Five and not three because three force an opinion on every row, including
 * the ones with nothing under them. "Sin dato" is a verdict: it says how many
 * registrations are still missing before anyone should decide.
 */
export type Veredicto = "escalar" | "mantener" | "bajar" | "apagar" | "sin_dato";

/** Provisional, pending the business number: below this nobody decides. */
export const MUESTRA_MINIMA = 30;

export const ETIQUETAS: Record<Veredicto, string> = {
  escalar: "Escalar",
  mantener: "Mantener",
  bajar: "Bajar",
  apagar: "Apagar",
  sin_dato: "Sin dato",
};

export function veredicto({
  ratio,
  registros,
  historia,
}: {
  ratio: number | null;
  registros: number | null;
  /** Ratio of the last weeks, oldest first. */
  historia: number[];
}): Veredicto {
  if (ratio === null || registros === null || registros < MUESTRA_MINIMA) {
    return "sin_dato";
  }

  const ultimas = historia.slice(-3);
  if (ultimas.length === 3 && ultimas.every((r) => r < 1)) return "apagar";

  if (ratio > 1.8) return "escalar";
  if (ratio >= 1.3) return "mantener";
  return "bajar";
}

/** How many registrations are still missing to be able to decide. */
export function faltanRegistros(registros: number | null): number {
  return Math.max(0, MUESTRA_MINIMA - (registros ?? 0));
}

/** Only Bajar and Apagar tint the whole row: the row is a decision. */
export const FONDO: Record<Veredicto, string> = {
  escalar: "",
  mantener: "",
  bajar: "bg-danger-bg",
  apagar: "bg-danger-bg",
  sin_dato: "",
};

export const TONO: Record<Veredicto, string> = {
  escalar: "text-green",
  mantener: "text-sec",
  bajar: "text-coral",
  apagar: "text-coral",
  sin_dato: "text-ter",
};
