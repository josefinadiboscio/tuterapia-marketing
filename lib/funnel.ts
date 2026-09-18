import { withDb } from "@/lib/db";
import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";

/**
 * The funnel, over buyers, on a free period.
 *
 * The cohort is whoever BOUGHT inside the window, and every stage is the same
 * group of people followed forward: how many of them sat down once, twice, six
 * times. The purchase is the base and it is drawn, because without it the
 * no-show between paying and sitting down has nowhere to show up.
 *
 * Each stage is cut at its own maturity. A period of ninety days holds buyers
 * from yesterday, and yesterday's buyer has not had time to do a sixth
 * session; counting them in the denominator would draw a drop that is only the
 * calendar. So stage k is computed over the buyers of the window who are at
 * least `madurez(k)` days old, and the row says how many that is.
 *
 * That is also why both percentage columns exist and neither replaces the
 * other: one reads the accumulated retention against the purchase, the other
 * reads the single step, and a step is only comparable against the previous
 * stage measured on the same population.
 */

export const PERIODOS = [90, 180, 365] as const;
export type Periodo = (typeof PERIODOS)[number];

/** The last session the screen draws. The table stores twelve. */
export const ULTIMA_ETAPA = 6;

/**
 * How long a stage needs before its number means anything, in days from the
 * purchase.
 *
 * Both numbers are measured, not assumed (METRICAS.md §5, §6 bis and §8), and
 * the p80 is used rather than the median so a stage is called mature when most
 * of the cohort has had the time, not half.
 *
 * Measured again on these very tables, over buyers rather than registrations:
 * purchase to first session has a p80 of 5 days in Argentina and the gap
 * between two sessions a p80 of 10 to 13. So these constants are strict early
 * and slightly loose late — the sixth session would want 60 days rather than
 * 55. Left as they are for now: recalibrating moves every number on the
 * screen, and it is a decision, not a fix.
 */
const DIAS_A_PRIMERA = 10;
const DIAS_ENTRE_SESIONES = 9;

/** Days a buyer needs to have had to be counted in stage `nro`. */
export function madurez(nro: number): number {
  if (nro <= 0) return 0;
  return DIAS_A_PRIMERA + (nro - 1) * DIAS_ENTRE_SESIONES;
}

/**
 * The no-return card has no clock of its own any more: it is the first-session
 * row of the table, so it inherits `madurez(2)` — nineteen days, enough for
 * the median buyer to have had a first session and a second. It used to carry
 * its own thirty-day cut and therefore its own, different number.
 */

export type FilaEtapa = {
  nro: number;
  etiqueta: string;
  /** Buyers of the window old enough to have reached this stage. */
  n: number | null;
  llegaron: number | null;
  /** Share of this row's own base that got here. */
  pctDelTotal: number | null;
  /**
   * People whose therapy ENDED here: they reached this stage and never the
   * next one. This is the one number the table is read for — "how many did
   * only one session" — and everything else on the row is measured to match
   * it.
   */
  seQuedaron: number | null;
  /** Of the buyers old enough to answer the question. The headline share. */
  pctSeQuedaron: number | null;
  /** Of the people who reached this stage. The same fact, other denominator. */
  pctDeLosQueLlegaron: number | null;
  /** Buyers the share above divides by. */
  nQuedaron: number | null;
  /** Last purchase day that can answer whether they came back. */
  corteQuedaron: string | null;
  /** Change of `pctSeQuedaron` against the previous period, in points. */
  deltaPp: number | null;
  /** Last day of purchase this row can include. */
  corte: string | null;
};

export type NoVuelven = {
  personas: number;
  pct: number;
  deltaPp: number | null;
  /** Buyers the share divides by. */
  base: number;
  /** Last day of purchase counted. */
  hasta: string;
};

export type VistaFunnel = {
  periodo: Periodo;
  desde: string;
  hasta: string;
  compradores: number;
  deltaCompradores: number | null;
  noVuelven: NoVuelven | null;
  etapas: FilaEtapa[];
};

export const ETIQUETA_ETAPA = [
  "Compraron",
  "1ª sesión",
  "2ª sesión",
  "3ª sesión",
  "4ª sesión",
  "5ª sesión",
  "6ª sesión",
];

export const ETIQUETA_TRAMO = [
  "Compra → 1ª",
  "1ª → 2ª",
  "2ª → 3ª",
  "3ª → 4ª",
  "4ª → 5ª",
  "5ª → 6ª",
];

export async function leerFunnel(
  pais: string,
  periodo: Periodo,
  ahora = new Date(),
): Promise<VistaFunnel> {
  const paises = pais === "TOTAL" ? ["AR", "UY"] : [pais];
  const hoy = diaLocal(ahora);
  const hasta = hoy;
  const desde = sumarDias(hasta, -(periodo - 1));
  const previo = { desde: sumarDias(desde, -periodo), hasta: sumarDias(desde, -1) };

  // One cut past the last visible stage: knowing who STOPPED at the sixth
  // session means knowing who did not reach the seventh.
  const cortes = Array.from({ length: ULTIMA_ETAPA + 2 }, (_, nro) =>
    minimo(hasta, sumarDias(hoy, -madurez(nro))),
  );
  // Every day of the previous period is older than the whole period, which is
  // longer than the longest maturity, so nothing there needs cutting.
  const cortesPrevios = cortes.map(() => previo.hasta);

  return withDb(async (db) => {
    const [actual, anterior] = await Promise.all([
      etapas(db, paises, desde, cortes),
      etapas(db, paises, previo.desde, cortesPrevios),
    ]);

    const filas = armarEtapas(actual, anterior, cortes);

    // The card IS the first-session row of the table, not a second
    // calculation of the same thing. Two numbers for one fact on one screen is
    // exactly what this project forbids, and it had two: 333 here and 398
    // there, because this one used its own thirty-day cut.
    const primera = filas[1];
    const noVuelven: NoVuelven | null =
      primera && primera.seQuedaron !== null && primera.pctSeQuedaron !== null
        ? {
            personas: primera.seQuedaron,
            pct: primera.pctSeQuedaron,
            deltaPp: primera.deltaPp,
            base: primera.nQuedaron ?? 0,
            hasta: primera.corteQuedaron ?? hasta,
          }
        : null;

    return {
      periodo,
      desde,
      hasta,
      compradores: actual.get(0)?.base ?? 0,
      deltaCompradores: delta(
        actual.get(0)?.base ?? 0,
        anterior.get(0)?.base ?? 0,
      ),
      noVuelven,
      etapas: filas,
    };
  });
}

type Conteo = { base: number; previa: number; actual: number };

/**
 * For every stage, three counts over the same population: the buyers that are
 * old enough, how many of them reached the stage before, and how many reached
 * this one.
 *
 * All three inside the stage's own cut, which is what makes the step
 * comparable — a drop measured between two different denominators is not a
 * drop.
 */
async function etapas(
  db: import("pg").Client,
  paises: string[],
  desde: string,
  cortes: string[],
): Promise<Map<number, Conteo>> {
  const { rows } = await db.query<{
    nro: number;
    base: string;
    previa: string;
    actual: string;
  }>(
    `with etapa as (
       select nro, corte from unnest($3::int[], $4::date[]) as t(nro, corte)
     )
     select e.nro,
            coalesce(sum(case when f.nro_sesion = 0 then f.pacientes end), 0)::text
              as base,
            coalesce(sum(case when f.nro_sesion = e.nro - 1 then f.pacientes end), 0)::text
              as previa,
            coalesce(sum(case when f.nro_sesion = e.nro then f.pacientes end), 0)::text
              as actual
       from etapa e
       left join marketing.funnel_etapas f
              on f.pais = any($1)
             and f.fecha_compra >= $2
             and f.fecha_compra <= e.corte
      group by e.nro`,
    [paises, desde, cortes.map((_, i) => i), cortes],
  );

  return new Map(
    rows.map((r) => [
      Number(r.nro),
      {
        base: Number(r.base),
        previa: Number(r.previa),
        actual: Number(r.actual),
      },
    ]),
  );
}

/**
 * One criterion for the whole table: what happened to the people AT each
 * stage.
 *
 * The row for "1ª sesión" is about the people who did a first session — how
 * many got there and how many of them ended there. It is not about the step
 * INTO the stage, which is the same table read backwards and the reason the
 * first row looked like it said 5% of people drop at the first session. That
 * 5% is real and belongs to "Compraron": paid and never sat down.
 *
 * "Ended here" is measured with the NEXT stage's maturity, not this one's.
 * Somebody who bought twelve days ago has reached a first session and has not
 * had time for a second; counting them as "stopped at one" would be counting
 * the calendar.
 */
function armarEtapas(
  actual: Map<number, Conteo>,
  anterior: Map<number, Conteo>,
  cortes: string[],
): FilaEtapa[] {
  const quedadosEn = (fuente: Map<number, Conteo>, nro: number) => {
    const sig = fuente.get(nro + 1);
    if (!sig || sig.base === 0 || sig.previa === 0) return null;
    const cuantos = Math.max(0, sig.previa - sig.actual);
    return {
      cuantos,
      llegaronAca: sig.previa,
      compradores: sig.base,
      pct: cuantos / sig.base,
      pctDeLosQueLlegaron: cuantos / sig.previa,
    };
  };

  return ETIQUETA_ETAPA.map((etiqueta, nro) => {
    const c = actual.get(nro);
    const vacia = !c || c.base === 0;
    const q = quedadosEn(actual, nro);
    const qPrevio = quedadosEn(anterior, nro);

    return {
      nro,
      etiqueta,
      n: vacia ? null : c!.base,
      llegaron: vacia ? null : nro === 0 ? c!.base : c!.actual,
      pctDelTotal: vacia ? null : nro === 0 ? 1 : c!.actual / c!.base,
      seQuedaron: q?.cuantos ?? null,
      pctSeQuedaron: q?.pct ?? null,
      pctDeLosQueLlegaron: q?.pctDeLosQueLlegaron ?? null,
      nQuedaron: q?.compradores ?? null,
      corteQuedaron: cortes[nro + 1] ?? null,
      deltaPp: q && qPrevio ? q.pct - qPrevio.pct : null,
      corte: cortes[nro] ?? null,
    };
  });
}

function delta(ahora: number, antes: number): number | null {
  if (antes === 0) return null;
  return ahora / antes - 1;
}

/** Today as a local calendar day (UTC−3), which is how every day is cut. */
function diaLocal(ahora: Date): string {
  return new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function sumarDias(fecha: string, dias: number): string {
  const t = Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function minimo(a: string, b: string): string {
  return a < b ? a : b;
}
