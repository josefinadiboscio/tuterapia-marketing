import { withDb } from "@/lib/db";
import { resolverPlataforma, type UtmMapping } from "@/lib/utm";
import {
  MUESTRA_MINIMA,
  ESCALAR,
  MANTENER,
  APAGAR,
  LTV_USD,
} from "@/lib/umbrales";

/**
 * Ads over a free date range.
 *
 * Spend lives at the day, per country and platform, and is edited from this
 * screen. Traffic lives at the day per raw utm_source. Both are summed over
 * whatever range is asked for, so changing one day changes every number that
 * depends on it and nothing has to be recomputed.
 *
 * **Instagram has no spend of its own.** Meta's budget buys the paid posts and
 * the organic reach that follows them, so the two are one unit of investment:
 * Instagram's registrations join Meta's pool when the platform's spend is
 * split among campaigns, and Instagram's own row shows the share it drew.
 */

// Growth Control's thresholds live in lib/umbrales so the browser can read
// them without pulling the database client in with them.
export {
  MUESTRA_MINIMA,
  ESCALAR,
  MANTENER,
  APAGAR,
  LTV_USD,
} from "@/lib/umbrales";

/** Meta pays for Instagram, so they share one pool of spend. */
export const PLATAFORMAS_DE_META = ["Meta", "Instagram"];

export type Estado = "escalar" | "mantener" | "bajar" | "apagar" | "sin_dato";

export type FilaUtm = {
  utm_source: string;
  descripcion: string | null;
  plataforma: string;
  registros: number;
  ventas: number;
  conversion: number | null;
  /** Spend apportioned by share of registrations — an estimate, and marked so. */
  gastoEstimado: number;
  cac: number | null;
  roas: number | null;
  /** Sales per week over the last six, oldest first. */
  tendencia: number[];
  /** What each of those weeks returned per dollar; NaN where nothing was spent. */
  tendenciaRoas: number[];
  estado: Estado;
  faltanRegistros: number;
  lectura: string;
};

export type FilaPlataforma = {
  plataforma: string;
  /** Meta's budget, shown on Instagram's row as borrowed rather than owned. */
  gasto: number;
  gastoPropio: boolean;
  /** Days of the range with a spend row, against the days in it. */
  diasConGasto: number;
  diasDelRango: number;
  registros: number;
  ventas: number;
  conversion: number | null;
  cac: number | null;
  roas: number | null;
  tendencia: number[];
  tendenciaRoas: number[];
  estado: Estado;
  faltanRegistros: number;
  lectura: string;
  campanas: FilaUtm[];
};

export type VistaAds = {
  desde: string;
  hasta: string;
  dias: number;
  gastoTotal: number;
  gastoDiario: number;
  pacientesTotal: number;
  pacientesDiario: number;
  cac: number | null;
  cacPrevio: number | null;
  /** New patients times what a patient is worth in their country, per day. */
  retornoDiario: number;
  retornoTotal: number;
  /** The same, after the spend that bought them. */
  netoDiario: number;
  netoTotal: number;
  /**
   * What each dollar of spend brought back, as a multiple.
   *
   * It is the LTV/CAC of the whole account — the same ratio the table shows
   * per platform — and it is kinder than any row of that table, because the
   * numerator counts every new patient of the period and the denominator only
   * the paid spend. Organic arrivals are in the return and cost nothing.
   */
  retornoPorDolar: number | null;
  filas: FilaPlataforma[];
  apagadas: FilaPlataforma[];
};

/**
 * What a given day cost, per platform and country, between two dates.
 *
 * Two sources with a clear precedence. From the day a rate takes effect the
 * rate is the answer: it is what somebody declared they are spending, and
 * changing it changes every day it covers. Before any rate starts, the day
 * rows carried over from the sheet answer instead.
 *
 * Neither invents anything. A platform with no rate and no row spent nothing
 * that day, which is exactly what TikTok did for most of the year.
 */
function gastoPorDia(desde: string, hasta: string): string {
  return `
  select d.fecha, d.pais, d.plataforma, d.monto_usd
    from marketing.gastos_diarios d
   where d.fecha >= ${desde} and d.fecha <= ${hasta}
     and not exists (
       select 1 from marketing.gasto_vigente v
        where v.pais = d.pais and v.plataforma = d.plataforma
          and v.vigente_desde <= d.fecha)
  union all
  select f.fecha, v.pais, v.plataforma, v.monto_usd
    from generate_series(${desde}::date, ${hasta}::date, '1 day') as f(fecha)
    join lateral (
      select distinct on (g.pais, g.plataforma) g.pais, g.plataforma, g.monto_usd
        from marketing.gasto_vigente g
       where g.vigente_desde <= f.fecha
       order by g.pais, g.plataforma, g.vigente_desde desc
    ) v on true`;
}

const ORDEN = ["Meta", "Instagram", "Google Ads", "TikTok"];

export async function leerAds(
  pais: string,
  desde: string,
  hasta: string,
): Promise<VistaAds> {
  const paises = pais === "TOTAL" ? ["AR", "UY"] : [pais];
  const dias = Math.max(1, diasEntre(desde, hasta));
  const previo = periodoPrevio(desde, hasta);

  return withDb(async (db) => {
    const [
      mapping,
      gastos,
      utm,
      semanal,
      descripciones,
      pacientesPorPais,
      ventasPrevias,
      gastoPrevio,
      gastoSemanal,
    ] = await Promise.all([
      db.query<UtmMapping>(
        "select patron, plataforma, superficie, es_pago, orden from marketing.utm_mapping",
      ),
      db.query<{ plataforma: string; monto: string; dias: string }>(
        // How many days of the range carry a row, alongside the total. A day
        // with no row counts as zero, which is right when nothing ran and
        // wrong when somebody forgot — and the two are indistinguishable
        // from the total alone.
        `select plataforma, sum(monto_usd)::text as monto,
                  count(distinct fecha)::text as dias
             from (${gastoPorDia("$1", "$2")}) g
            where pais = any($3)
            group by plataforma`,
        [desde, hasta, paises],
      ),
      db.query<{
        utm_source: string;
        registros: string;
        ventas: string;
        convertidos: string;
      }>(
        `select utm_source,
                  coalesce(sum(registros), 0)::text as registros,
                  coalesce(sum(pacientes_nuevos), 0)::text as ventas,
                  coalesce(sum(convertidos), 0)::text as convertidos
             from marketing.metricas_utm
            where pais = any($3) and fecha >= $1 and fecha <= $2
            group by utm_source`,
        [desde, hasta, paises],
      ),
      // Six weeks per source, for the trend line and for the weekly ROAS the
      // switch-off rule needs.
      db.query<{
        semana: string;
        utm_source: string;
        ventas: string;
        registros: string;
      }>(
        `select to_char(date_trunc('week', fecha), 'YYYY-MM-DD') as semana,
                  utm_source,
                  coalesce(sum(pacientes_nuevos), 0)::text as ventas,
                  coalesce(sum(registros), 0)::text as registros
             from marketing.metricas_utm
            where pais = any($2) and fecha > $1::date - 42 and fecha <= $1::date
            group by 1, 2 order by 1`,
        [hasta, paises],
      ),
      db.query<{ utm_source: string; descripcion: string }>(
        "select utm_source, descripcion from marketing.utm_descripcion",
      ),
      // New patients split by country: what the period returned is their
      // count times what a patient is worth there, and the two countries are
      // worth very different amounts.
      db.query<{ pais: string; ventas: string }>(
        `select pais, coalesce(sum(pacientes_nuevos), 0)::text as ventas
             from marketing.metricas_utm
            where pais = any($3) and fecha >= $1 and fecha <= $2
            group by pais`,
        [desde, hasta, paises],
      ),
      db.query<{ ventas: string }>(
        `select coalesce(sum(pacientes_nuevos), 0)::text as ventas
             from marketing.metricas_utm
            where pais = any($3) and fecha >= $1 and fecha <= $2`,
        [previo.desde, previo.hasta, paises],
      ),
      db.query<{ monto: string }>(
        `select coalesce(sum(monto_usd), 0)::text as monto
             from (${gastoPorDia("$1", "$2")}) g
            where pais = any($3)`,
        [previo.desde, previo.hasta, paises],
      ),
      db.query<{ semana: string; plataforma: string; monto: string }>(
        `select to_char(date_trunc('week', fecha), 'YYYY-MM-DD') as semana,
                  plataforma, sum(monto_usd)::text as monto
             from (${gastoPorDia("($1::date - 41)", "$1")}) g
            where pais = any($2)
            group by 1, 2`,
        [hasta, paises],
      ),
    ]);

    const mapa = mapping.rows;
    const notas = new Map(
      descripciones.rows.map((d) => [d.utm_source, d.descripcion]),
    );

    const gastoPlataforma = new Map<string, number>();
    const diasConGasto = new Map<string, number>();
    for (const g of gastos.rows) {
      gastoPlataforma.set(g.plataforma, Number(g.monto));
      diasConGasto.set(g.plataforma, Number(g.dias));
    }
    const gastoTotal = [...gastoPlataforma.values()].reduce((a, b) => a + b, 0);

    // Group the raw sources under the platform their pattern maps to.
    type Acc = { registros: number; ventas: number; convertidos: number };
    const porSource = new Map<string, Acc & { plataforma: string }>();
    for (const r of utm.rows) {
      porSource.set(r.utm_source, {
        plataforma: resolverPlataforma(r.utm_source, mapa),
        registros: Number(r.registros),
        ventas: Number(r.ventas),
        convertidos: Number(r.convertidos),
      });
    }

    const semanas = [...new Set(semanal.rows.map((r) => r.semana))].sort();

    type Sem = { ventas: number; registros: number };
    const porSemana = new Map<string, Map<string, Sem>>();
    for (const r of semanal.rows) {
      const m = porSemana.get(r.utm_source) ?? new Map<string, Sem>();
      m.set(r.semana, {
        ventas: Number(r.ventas),
        registros: Number(r.registros),
      });
      porSemana.set(r.utm_source, m);
    }

    const gastoSemPlat = new Map<string, number>();
    for (const g of gastoSemanal.rows) {
      gastoSemPlat.set(`${g.semana}|${g.plataforma}`, Number(g.monto));
    }

    /** Sales per week, added across whichever sources the row covers. */
    const serieDe = (sources: string[]) =>
      semanas.map((sem) =>
        sources.reduce(
          (a, s) => a + (porSemana.get(s)?.get(sem)?.ventas ?? 0),
          0,
        ),
      );

    const plataformaDe = (source: string) => resolverPlataforma(source, mapa);

    /** Every source that shares a pool of spend with this platform. */
    const fuentesDelPool = (plataforma: string) => {
      const enPool = PLATAFORMAS_DE_META.includes(plataforma);
      return [...porSource.keys()].filter((s) =>
        enPool
          ? PLATAFORMAS_DE_META.includes(plataformaDe(s))
          : plataformaDe(s) === plataforma,
      );
    };

    /** Which platform's budget pays for this one. Instagram's is Meta's. */
    const plataformaQuePaga = (plataforma: string) =>
      PLATAFORMAS_DE_META.includes(plataforma) ? "Meta" : plataforma;

    // What the period brought in, patient by patient, at the value of the
    // country each one came from.
    const retornoBruto = pacientesPorPais.rows.reduce(
      (a, r) => a + Number(r.ventas) * (LTV_USD[r.pais] ?? 0),
      0,
    );
    const pacientesConValor = pacientesPorPais.rows.reduce(
      (a, r) => a + Number(r.ventas),
      0,
    );
    // One ROAS per row needs one LTV. Looking at a single country it is that
    // country's; looking at both it is the two blended by the mix of patients
    // actually sold, so the ratio moves with the mix the way the money does.
    const ltv = pacientesConValor > 0 ? retornoBruto / pacientesConValor : null;

    /**
     * The ROAS of each of the last six weeks, built exactly like the period's:
     * the same pool of spend, split by share of registrations. So "three weeks
     * under 1" means week by week what it means over the whole range.
     */
    const roasSemanalDe = (sources: string[], plataforma: string): number[] => {
      if (ltv === null) return [];
      const pool = fuentesDelPool(plataforma);
      const paga = plataformaQuePaga(plataforma);

      return semanas.map((sem) => {
        const gastoPool = gastoSemPlat.get(`${sem}|${paga}`) ?? 0;
        const regPool = pool.reduce(
          (a, s) => a + (porSemana.get(s)?.get(sem)?.registros ?? 0),
          0,
        );
        const reg = sources.reduce(
          (a, s) => a + (porSemana.get(s)?.get(sem)?.registros ?? 0),
          0,
        );
        const ventas = sources.reduce(
          (a, s) => a + (porSemana.get(s)?.get(sem)?.ventas ?? 0),
          0,
        );
        const gasto = regPool > 0 ? gastoPool * (reg / regPool) : 0;
        // No spend that week is not a return of zero, it is no ratio at all.
        return gasto > 0 ? (ventas * ltv) / gasto : Number.NaN;
      });
    };

    const filas: FilaPlataforma[] = [];

    for (const plataforma of ORDEN) {
      const fuentes = [...porSource.entries()].filter(
        ([, v]) => v.plataforma === plataforma,
      );
      const pool = fuentesDelPool(plataforma);
      const poolGasto = gastoPlataforma.get(plataformaQuePaga(plataforma)) ?? 0;
      const poolRegistros = pool.reduce(
        (a, s) => a + (porSource.get(s)?.registros ?? 0),
        0,
      );

      const registros = fuentes.reduce((a, [, v]) => a + v.registros, 0);
      const ventas = fuentes.reduce((a, [, v]) => a + v.ventas, 0);
      const convertidos = fuentes.reduce((a, [, v]) => a + v.convertidos, 0);
      if (poolGasto === 0 && registros === 0) continue;

      // The platform's share of the pool it draws on, by registrations. For
      // Google Ads and TikTok the pool is the platform itself, so this is
      // exactly what was spent on it.
      const gasto =
        poolRegistros > 0 ? poolGasto * (registros / poolRegistros) : 0;

      const conversion = registros > 0 ? convertidos / registros : null;
      const cac = ventas > 0 && gasto > 0 ? gasto / ventas : null;
      const roas = cac !== null && ltv !== null ? ltv / cac : null;

      const nombres = fuentes.map(([s]) => s);
      const serie = serieDe(nombres);
      const serieRoas = roasSemanalDe(nombres, plataforma);
      const estado = estadoDe(roas, registros, serieRoas);

      const campanas: FilaUtm[] = fuentes
        .map(([source, v]) => {
          const gastoEstimado =
            poolRegistros > 0 ? poolGasto * (v.registros / poolRegistros) : 0;
          const conv = v.registros > 0 ? v.convertidos / v.registros : null;
          const cacUtm =
            v.ventas > 0 && gastoEstimado > 0 ? gastoEstimado / v.ventas : null;
          const roasUtm = cacUtm !== null && ltv !== null ? ltv / cacUtm : null;
          const serieRoasUtm = roasSemanalDe([source], plataforma);
          const estadoUtm = estadoDe(roasUtm, v.registros, serieRoasUtm);
          return {
            utm_source: source === "" ? "(sin tag)" : source,
            descripcion: notas.get(source) ?? null,
            plataforma,
            registros: v.registros,
            ventas: v.ventas,
            conversion: conv,
            gastoEstimado,
            cac: cacUtm,
            roas: roasUtm,
            tendencia: serieDe([source]),
            tendenciaRoas: serieRoasUtm,
            estado: estadoUtm,
            faltanRegistros: Math.max(0, MUESTRA_MINIMA - v.registros),
            lectura: lecturaDe(estadoUtm, {
              roas: roasUtm,
              conversion: conv,
              conversionPlataforma: conversion,
              registros: v.registros,
              serie: serieDe([source]),
              plataforma,
            }),
          };
        })
        .sort((a, b) => b.registros - a.registros);

      filas.push({
        plataforma,
        gasto,
        // Instagram draws on Meta's budget and has none of its own.
        gastoPropio:
          !PLATAFORMAS_DE_META.includes(plataforma) || plataforma === "Meta",
        diasConGasto: diasConGasto.get(plataformaQuePaga(plataforma)) ?? 0,
        diasDelRango: dias,
        registros,
        ventas,
        conversion,
        cac,
        roas,
        tendencia: serie,
        tendenciaRoas: serieRoas,
        estado,
        faltanRegistros: Math.max(0, MUESTRA_MINIMA - registros),
        lectura: lecturaDe(estado, {
          roas,
          conversion,
          conversionPlataforma: null,
          registros,
          serie,
          plataforma,
        }),
        campanas,
      });
    }

    // Every patient of the period, not only those four platforms brought:
    // the CAC denominator is all new patients, the same as on General.
    const pacientesTotal = [...porSource.values()].reduce(
      (a, v) => a + v.ventas,
      0,
    );
    const ventasPrevio = Number(ventasPrevias.rows[0]?.ventas ?? 0);
    const montoPrevio = Number(gastoPrevio.rows[0]?.monto ?? 0);

    return {
      desde,
      hasta,
      dias,
      gastoTotal,
      gastoDiario: gastoTotal / dias,
      pacientesTotal,
      pacientesDiario: pacientesTotal / dias,
      cac:
        pacientesTotal > 0 && gastoTotal > 0
          ? gastoTotal / pacientesTotal
          : null,
      cacPrevio:
        ventasPrevio > 0 && montoPrevio > 0 ? montoPrevio / ventasPrevio : null,
      retornoTotal: retornoBruto,
      retornoDiario: retornoBruto / dias,
      netoTotal: retornoBruto - gastoTotal,
      netoDiario: (retornoBruto - gastoTotal) / dias,
      retornoPorDolar: gastoTotal > 0 ? retornoBruto / gastoTotal : null,
      filas: filas.filter((f) => f.estado !== "apagar"),
      apagadas: filas.filter((f) => f.estado === "apagar"),
    };
  });
}

/**
 * `roasSemanal` carries NaN for a week with no spend: that is no ratio at all,
 * not a return of zero, and it must not count towards a switch-off.
 */
function estadoDe(
  roas: number | null,
  registros: number,
  roasSemanal: number[],
): Estado {
  if (roas === null || registros < MUESTRA_MINIMA) return "sin_dato";

  const ultimas = roasSemanal.slice(-3);
  const apagar =
    ultimas.length === 3 &&
    ultimas.every((v) => Number.isFinite(v) && v < APAGAR);
  if (apagar) return "apagar";

  if (roas > ESCALAR) return "escalar";
  if (roas >= MANTENER) return "mantener";
  return "bajar";
}

/**
 * Why the row says what it says, in its own numbers.
 *
 * Never a generic sentence: an instruction without a reason is not worth the
 * row it sits on.
 */
function lecturaDe(
  estado: Estado,
  d: {
    roas: number | null;
    conversion: number | null;
    conversionPlataforma: number | null;
    registros: number;
    serie: number[];
    plataforma: string;
  },
): string {
  const pct = (v: number | null) =>
    v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`;
  const dos = (v: number) => v.toFixed(2).replace(".", ",");

  if (estado === "sin_dato") {
    const faltan = MUESTRA_MINIMA - d.registros;
    return `${d.registros} registros en el período; faltan ${faltan} para poder opinar.`;
  }

  const caida = semanasEnCaida(d.serie);
  const contraPlataforma =
    d.conversionPlataforma !== null && d.conversion !== null
      ? ` Convierte ${pct(d.conversion)} contra ${pct(d.conversionPlataforma)} de ${d.plataforma}.`
      : "";

  if (estado === "apagar") {
    return `Lleva 3 semanas devolviendo menos de lo que cuesta.${contraPlataforma}`;
  }
  if (estado === "escalar") {
    const margen = d.roas! - ESCALAR;
    return `Devuelve ${dos(d.roas!)} por dólar, ${dos(margen)} por encima del umbral de escalar.${contraPlataforma}`;
  }
  if (estado === "bajar") {
    const falta = MANTENER - d.roas!;
    return `Devuelve ${dos(d.roas!)}, ${dos(falta)} por debajo de 1,30.${caida ? ` ${caida} semanas seguidas de caída en ventas.` : ""}${contraPlataforma}`;
  }
  return `Devuelve ${dos(d.roas!)} por dólar, dentro de la banda 1,30–1,80.${contraPlataforma}`;
}

/** How many consecutive weeks at the end of the series fell. */
function semanasEnCaida(serie: number[]): number {
  let n = 0;
  for (let i = serie.length - 1; i > 0; i--) {
    if (serie[i]! < serie[i - 1]!) n++;
    else break;
  }
  return n;
}

function sumarSeries(series: number[][]): number[] {
  const largo = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length: largo }, (_, i) =>
    series.reduce((a, s) => a + (s[s.length - largo + i] ?? 0), 0),
  );
}

function diasEntre(desde: string, hasta: string): number {
  const d = Date.parse(`${desde}T00:00:00Z`);
  const h = Date.parse(`${hasta}T00:00:00Z`);
  return Math.floor((h - d) / 86_400_000) + 1;
}

/** The same number of days, immediately before the range. */
function periodoPrevio(desde: string, hasta: string) {
  const dias = diasEntre(desde, hasta);
  const d = Date.parse(`${desde}T00:00:00Z`);
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    desde: iso(d - dias * 86_400_000),
    hasta: iso(d - 86_400_000),
  };
}

/** The default range: the last 30 days the traffic grain covers. */
export async function rangoPorDefecto(): Promise<{
  desde: string;
  hasta: string;
}> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ hasta: string }>(
      "select coalesce(max(fecha), current_date)::text as hasta from marketing.metricas_utm",
    );
    const hasta = rows[0]?.hasta ?? new Date().toISOString().slice(0, 10);
    const desde = new Date(Date.parse(`${hasta}T00:00:00Z`) - 29 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return { desde, hasta };
  });
}
