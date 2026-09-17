/**
 * Growth Control's thresholds, on LTV/CAC.
 *
 * They live apart from lib/ads.ts because the table and the bars colour
 * themselves in the browser and would otherwise drag the database client into
 * the bundle to read a number. One definition, two consumers.
 */

/** Below this, a row gets a verdict of "sin dato" and says what it is missing. */
export const MUESTRA_MINIMA = 30;

export const ESCALAR = 1.8;
export const MANTENER = 1.3;
/** Three weeks under this in a row is a switch-off, not a trim. */
export const APAGAR = 1.0;

export type Tono = "verde" | "oro" | "coral" | "nulo";

/**
 * What one week's return is worth, as a colour.
 *
 * Green pays for itself with room to spare, gold pays for itself and no more,
 * coral does not. A week with no spend has no ratio and gets no colour: it is
 * grey, not red.
 */
export function tonoDeRoas(roas: number | null | undefined): Tono {
  if (roas === null || roas === undefined || !Number.isFinite(roas))
    return "nulo";
  if (roas >= MANTENER) return "verde";
  if (roas >= APAGAR) return "oro";
  return "coral";
}

/**
 * What a patient is worth over their life, in dollars of margin, by country.
 *
 * The figure the business runs on, decided on 2026-09-17: sixty in Argentina,
 * a hundred and twenty in Uruguay. It is the lifetime value, not the
 * ninety-day one — what a campaign returns is what the patient it bought ends
 * up worth, not what they are worth by the end of the quarter.
 *
 * Every dollar figure on Ads comes from here: the daily return and the ROAS
 * that decides whether a campaign scales or goes off. Change it here and both
 * change together.
 */
export const LTV_USD: Record<string, number> = { AR: 60, UY: 120 };
