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
 * The no-return card only counts buyers with at least this many days behind
 * them. Enough for the median buyer to have had a first session and a second:
 * ten days plus nine, with room to spare.
 */
const DIAS_PARA_VOLVER = 30;

export type FilaEtapa = {
  nro: number;
  etiqueta: string;
  /** Buyers of the window old enough for this stage. null: none are. */
  n: number | null;
  llegaron: number | null;
  /** How many of this row's base had reached the stage before it. */
  previa: number | null;
  /** Share of this row's own base that got here. */
  pctDelTotal: number | null;
  cayeron: number | null;
  /** Share of the previous stage, on this row's base, that stopped here. */
  caida: number | null;
  /** Change of that drop against the previous period, in points. */
  deltaPp: number | null;
  /** Last day of purchase this row can include. */
  corte: string | null;
};

export type FilaTiempo = {
  tramo: number;
  etiqueta: string;
  mediana: number | null;
  p80: number | null;
  /** Change of the median against the previous period, in days. */
  deltaDias: number | null;
  n: number | null;
};

export type NoVuelven = {
  personas: number;
  pct: number;
  deltaPp: number | null;
  /** Buyers with a first session the figure rests on. */
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
  tiempos: FilaTiempo[];
  lectura: string | null;
  /** Cohort months, for the nominal download. */
  meses: string[];
};

const ETIQUETA_ETAPA = [
  "Compraron",
  "1ª sesión",
  "2ª sesión",
  "3ª sesión",
  "4ª sesión",
  "5ª sesión",
  "6ª sesión",
];

const ETIQUETA_TRAMO = [
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

  // Stage k can only count buyers who are madurez(k) days old.
  const cortes = Array.from({ length: ULTIMA_ETAPA + 1 }, (_, nro) =>
    minimo(hasta, sumarDias(hoy, -madurez(nro))),
  );
  // Every day of the previous period is older than the whole period, which is
  // longer than the longest maturity, so nothing there needs cutting.
  const cortesPrevios = cortes.map(() => previo.hasta);

  return withDb(async (db) => {
    const [actual, anterior, tiempos, tiemposPrevios, retorno, meses] =
      await Promise.all([
        etapas(db, paises, desde, cortes),
        etapas(db, paises, previo.desde, cortesPrevios),
        histograma(db, paises, desde, cortes),
        histograma(db, paises, previo.desde, cortesPrevios),
        sinRetorno(db, paises, desde, hasta, previo, hoy),
        db.query<{ mes: string }>(
          `select distinct to_char(mes, 'YYYY-MM') as mes
             from marketing.metricas_mensuales
            where es_provisorio = false order by mes desc limit 12`,
        ),
      ]);

    const filas = armarEtapas(actual, anterior, cortes);

    return {
      periodo,
      desde,
      hasta,
      compradores: actual.get(0)?.base ?? 0,
      deltaCompradores: delta(
        actual.get(0)?.base ?? 0,
        anterior.get(0)?.base ?? 0,
      ),
      noVuelven: retorno,
      etapas: filas,
      tiempos: armarTiempos(tiempos, tiemposPrevios),
      lectura: lecturaDe(filas),
      meses: meses.rows.map((m) => m.mes),
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

function armarEtapas(
  actual: Map<number, Conteo>,
  anterior: Map<number, Conteo>,
  cortes: string[],
): FilaEtapa[] {
  const caidaDe = (c: Conteo | undefined, nro: number): number | null => {
    if (nro === 0 || !c || c.previa === 0) return null;
    return (c.previa - c.actual) / c.previa;
  };

  return ETIQUETA_ETAPA.map((etiqueta, nro) => {
    const c = actual.get(nro);
    const vacia = !c || c.base === 0;

    if (nro === 0) {
      return {
        nro,
        etiqueta,
        n: vacia ? null : c!.base,
        llegaron: vacia ? null : c!.base,
        previa: null,
        pctDelTotal: vacia ? null : 1,
        cayeron: null,
        caida: null,
        deltaPp: null,
        corte: cortes[nro] ?? null,
      };
    }

    const caida = caidaDe(c, nro);
    const caidaPrevia = caidaDe(anterior.get(nro), nro);

    return {
      nro,
      etiqueta,
      n: vacia ? null : c!.base,
      llegaron: vacia ? null : c!.actual,
      previa: vacia ? null : c!.previa,
      pctDelTotal: vacia ? null : c!.actual / c!.base,
      cayeron: vacia || caida === null ? null : c!.previa - c!.actual,
      caida,
      deltaPp:
        caida === null || caidaPrevia === null ? null : caida - caidaPrevia,
      corte: cortes[nro] ?? null,
    };
  });
}

/** The day histogram of every trip, each one inside its own maturity cut. */
async function histograma(
  db: import("pg").Client,
  paises: string[],
  desde: string,
  cortes: string[],
): Promise<Map<number, { dias: number; n: number }[]>> {
  // Trip t is complete when session t+1 happens, so it matures with that stage.
  const tramos = ETIQUETA_TRAMO.map((_, t) => t);
  const { rows } = await db.query<{ tramo: number; dias: number; n: string }>(
    `with tramo as (
       select tramo, corte from unnest($3::int[], $4::date[]) as t(tramo, corte)
     )
     select t.tramo, f.dias, sum(f.pacientes)::text as n
       from tramo t
       join marketing.funnel_tiempos f
              on f.tramo = t.tramo
             and f.pais = any($1)
             and f.fecha_compra >= $2
             and f.fecha_compra <= t.corte
      group by t.tramo, f.dias
      order by t.tramo, f.dias`,
    [paises, desde, tramos, tramos.map((t) => cortes[t + 1] ?? cortes.at(-1)!)],
  );

  const salida = new Map<number, { dias: number; n: number }[]>();
  for (const r of rows) {
    const lista = salida.get(Number(r.tramo)) ?? [];
    lista.push({ dias: Number(r.dias), n: Number(r.n) });
    salida.set(Number(r.tramo), lista);
  }
  return salida;
}

function armarTiempos(
  actual: Map<number, { dias: number; n: number }[]>,
  anterior: Map<number, { dias: number; n: number }[]>,
): FilaTiempo[] {
  return ETIQUETA_TRAMO.map((etiqueta, tramo) => {
    const h = actual.get(tramo) ?? [];
    const total = h.reduce((a, x) => a + x.n, 0);
    const mediana = percentil(h, 0.5);
    const medianaPrevia = percentil(anterior.get(tramo) ?? [], 0.5);

    return {
      tramo,
      etiqueta,
      mediana,
      p80: percentil(h, 0.8),
      deltaDias:
        mediana === null || medianaPrevia === null ? null : mediana - medianaPrevia,
      n: total === 0 ? null : total,
    };
  });
}

/**
 * Nearest-rank percentile over a histogram: the first day value at which the
 * running count reaches the share asked for.
 *
 * No interpolation. The values are whole days and a median of 4,5 days would
 * be a number nobody can act on.
 */
function percentil(
  histograma: { dias: number; n: number }[],
  parte: number,
): number | null {
  const total = histograma.reduce((a, x) => a + x.n, 0);
  if (total === 0) return null;

  const objetivo = Math.ceil(total * parte);
  let acumulado = 0;
  for (const { dias, n } of [...histograma].sort((a, b) => a.dias - b.dias)) {
    acumulado += n;
    if (acumulado >= objetivo) return dias;
  }
  return null;
}

/**
 * Of the people who sat down once, how many never came back.
 *
 * Only buyers with thirty days behind them: somebody who bought on Tuesday has
 * not "failed to return", they have not had the chance. Excluding them is what
 * keeps the number from moving every time a good week of sales comes in.
 */
async function sinRetorno(
  db: import("pg").Client,
  paises: string[],
  desde: string,
  hasta: string,
  previo: { desde: string; hasta: string },
  hoy: string,
): Promise<NoVuelven | null> {
  const corte = minimo(hasta, sumarDias(hoy, -DIAS_PARA_VOLVER));
  if (corte < desde) return null;

  const contar = async (d: string, h: string) => {
    const { rows } = await db.query<{ primera: string; segunda: string }>(
      `select coalesce(sum(case when nro_sesion = 1 then pacientes end), 0)::text
                as primera,
              coalesce(sum(case when nro_sesion = 2 then pacientes end), 0)::text
                as segunda
         from marketing.funnel_etapas
        where pais = any($1) and fecha_compra >= $2 and fecha_compra <= $3`,
      [paises, d, h],
    );
    return {
      primera: Number(rows[0]?.primera ?? 0),
      segunda: Number(rows[0]?.segunda ?? 0),
    };
  };

  const [ahora, antes] = await Promise.all([
    contar(desde, corte),
    contar(previo.desde, previo.hasta),
  ]);

  if (ahora.primera === 0) return null;

  const pct = (ahora.primera - ahora.segunda) / ahora.primera;
  const pctPrevio =
    antes.primera === 0 ? null : (antes.primera - antes.segunda) / antes.primera;

  return {
    personas: ahora.primera - ahora.segunda,
    pct,
    deltaPp: pctPrevio === null ? null : pct - pctPrevio,
    base: ahora.primera,
    hasta: corte,
  };
}

/**
 * Where the funnel loses people, how much of the total loss that one step is,
 * and whether it is moving.
 *
 * The rules, so the sentence is never a guess (METRICAS.md §7 ter):
 *  · the worst step is the mature stage with the highest drop against the
 *    stage before it, the purchase-to-first-session one included;
 *  · its weight is its own losses over everything lost up to the sixth session;
 *  · it is improving or worsening when its drop moved at least a point against
 *    the previous period, and stable inside that.
 */
function lecturaDe(filas: FilaEtapa[]): string | null {
  const conCaida = filas.filter(
    (f): f is FilaEtapa & { caida: number; cayeron: number; previa: number } =>
      f.caida !== null && f.cayeron !== null && f.previa !== null,
  );
  if (conCaida.length === 0) return null;

  const peor = conCaida.reduce((a, b) => (b.caida > a.caida ? b : a));
  const perdidoTotal = conCaida.reduce((a, f) => a + f.cayeron, 0);
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

  const tramo =
    peor.nro === 1
      ? "entre la compra y la primera sesión"
      : `entre la ${peor.nro - 1}ª sesión y la ${peor.nro}ª`;

  // The denominator of the step, not the buyer base: they are different
  // numbers and naming the wrong one makes the sentence say something false.
  const deQuienes =
    peor.nro === 1
      ? `${peor.previa} compradores`
      : `${peor.previa} que habían llegado a la ${peor.nro - 1}ª`;

  const peso =
    perdidoTotal > 0
      ? ` Ahí se va ${pct(peor.cayeron / perdidoTotal)} de todo lo que se pierde hasta la 6ª sesión.`
      : "";

  const base = `La pérdida más grande está ${tramo}: se van ${peor.cayeron} de ${deQuienes}, ${pct(peor.caida)}.${peso}`;

  if (peor.deltaPp === null) return base;
  if (Math.abs(peor.deltaPp) < 0.01) {
    return `${base} Igual que en el período anterior.`;
  }
  return peor.deltaPp < 0
    ? `${base} Viene mejorando: ${(Math.abs(peor.deltaPp) * 100).toFixed(1)} puntos menos de caída que en el período anterior.`
    : `${base} Viene empeorando: ${(peor.deltaPp * 100).toFixed(1)} puntos más de caída que en el período anterior.`;
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
