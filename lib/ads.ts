import { withDb } from "@/lib/db";
import { resolverPlataforma, type UtmMapping } from "@/lib/utm";

/**
 * Ads reads two levels off one table.
 *
 * `marketing.metricas_utm` keeps the raw utm_source, and the platform level is
 * the sum of its sources. Both levels therefore come from the same rows and
 * cannot disagree, and fixing a mapping pattern regroups everything already
 * stored without a resync.
 *
 * **Spend is measured per platform, by design.** It is planned and loaded that
 * way, so CAC and the ratio exist at the platform level and simply do not
 * exist per campaign. The UTM level is not a version of the platform level
 * with holes in it: it answers a different question — which campaigns bring
 * traffic that converts — and carries only the columns that question needs.
 */

/** Below this, a row gets neither a verdict nor a conversion alert. */
export const MUESTRA_MINIMA = 30;

/**
 * How far below its platform's conversion a campaign has to sit before it is
 * worth looking at. Two thirds of the platform average: enough of a gap that
 * it is not noise at thirty registrations.
 */
export const UMBRAL_ALERTA = 0.66;

export type FilaUtm = {
  utm_source: string;
  registros: number;
  pacientes_nuevos: number;
  conversion: number | null;
  /** Conversion is far below its platform's, with the volume to mean it. */
  alerta: boolean;
};

export type FilaPlataforma = {
  plataforma: string;
  pais: string;
  gasto: number;
  registros: number;
  pacientes_nuevos: number;
  conversion: number | null;
  cac: number | null;
  ratio: number | null;
  /** Ratio of the last weeks, oldest first, for the sparkline. */
  historia: number[];
  campanas: FilaUtm[];
};

export type VistaAds = {
  semanas: string[];
  semana: string | null;
  filas: FilaPlataforma[];
  totalGasto: number;
  totalRegistros: number;
  totalNuevos: number;
  cacMedio: number | null;
  /** LTV of the country, used as the numerator of every ratio. */
  ltv: { pais: string; valor: number | null }[];
};

const SEMANAS_HISTORIA = 6;

export async function leerAds(pais: string, semana?: string): Promise<VistaAds> {
  return withDb(async (db) => {
    const paises = pais === "TOTAL" ? ["AR", "UY"] : [pais];

    const { rows: semanas } = await db.query<{ semana: string; cerrada: boolean }>(
      // A week still running has its spend loaded but only part of its
      // registrations, so every ratio in it reads low. The default lands on
      // the last week the daily grain covers end to end.
      `select semana::text,
              (semana + 6 <= (select max(fecha) from marketing.metricas_utm)) as cerrada
         from marketing.gastos group by semana order by semana desc limit 26`,
    );
    const disponibles = semanas.map((s) => s.semana);
    const elegida =
      semana && disponibles.includes(semana)
        ? semana
        : (semanas.find((s) => s.cerrada)?.semana ?? disponibles[0] ?? null);

    if (!elegida) {
      return {
        semanas: [],
        semana: null,
        filas: [],
        totalGasto: 0,
        totalRegistros: 0,
        totalNuevos: 0,
        cacMedio: null,
        ltv: [],
      };
    }

    const [mapping, gastos, utm, historia, ltv] = await Promise.all([
      db.query<UtmMapping>(
        "select patron, plataforma, superficie, es_pago, orden from marketing.utm_mapping",
      ),
      db.query<{ pais: string; canal: string; monto_usd: string }>(
        `select pais, canal, monto_usd::text
           from marketing.gastos where semana = $1 and pais = any($2)`,
        [elegida, paises],
      ),
      db.query<{
        pais: string;
        utm_source: string;
        registros: string;
        pacientes_nuevos: string;
        convertidos: string;
      }>(
        `select pais, utm_source,
                coalesce(sum(registros), 0)::text as registros,
                coalesce(sum(pacientes_nuevos), 0)::text as pacientes_nuevos,
                coalesce(sum(convertidos), 0)::text as convertidos
           from marketing.metricas_utm
          where pais = any($2) and fecha >= $1::date and fecha < $1::date + 7
          group by pais, utm_source`,
        [elegida, paises],
      ),
      // The previous weeks, for the ratio sparkline.
      db.query<{
        semana: string;
        pais: string;
        utm_source: string;
        registros: string;
        pacientes_nuevos: string;
      }>(
        `select g.semana::text, m.pais, m.utm_source,
                coalesce(sum(m.registros), 0)::text as registros,
                coalesce(sum(m.pacientes_nuevos), 0)::text as pacientes_nuevos
           from (select distinct semana from marketing.gastos
                  where semana <= $1::date
                  order by semana desc limit ${SEMANAS_HISTORIA}) g
           join marketing.metricas_utm m
             on m.fecha >= g.semana and m.fecha < g.semana + 7
          where m.pais = any($2)
          group by g.semana, m.pais, m.utm_source`,
        [elegida, paises],
      ),
      db.query<{ pais: string; ltv_usd: string | null }>(
        `select distinct on (pais) pais, ltv_usd::text
           from marketing.metricas_mensuales
          where plataforma = 'TODAS' and pais = any($1) and ltv_usd is not null
          order by pais, mes desc`,
        [paises],
      ),
    ]);

    const mapa = mapping.rows;
    const ltvPorPais = new Map(
      ltv.rows.map((r) => [r.pais, r.ltv_usd === null ? null : Number(r.ltv_usd)]),
    );

    // Spend arrives by channel, which is already a platform name.
    const gastoPorClave = new Map<string, number>();
    for (const g of gastos.rows) {
      const clave = `${g.pais}|${g.canal}`;
      gastoPorClave.set(clave, (gastoPorClave.get(clave) ?? 0) + Number(g.monto_usd));
    }

    // Group the raw sources into platforms, keeping the sources underneath.
    type Acc = {
      registros: number;
      nuevos: number;
      convertidos: number;
      campanas: Map<string, { registros: number; nuevos: number; convertidos: number }>;
    };
    const porPlataforma = new Map<string, Acc>();

    for (const r of utm.rows) {
      const plataforma = resolverPlataforma(r.utm_source, mapa);
      const clave = `${r.pais}|${plataforma}`;
      const acc =
        porPlataforma.get(clave) ??
        { registros: 0, nuevos: 0, convertidos: 0, campanas: new Map() };

      const registros = Number(r.registros);
      const nuevos = Number(r.pacientes_nuevos);
      const convertidos = Number(r.convertidos);

      acc.registros += registros;
      acc.nuevos += nuevos;
      acc.convertidos += convertidos;
      acc.campanas.set(r.utm_source, { registros, nuevos, convertidos });
      porPlataforma.set(clave, acc);
    }

    // The ratio over previous weeks, per platform, for the sparkline.
    const histPorPlataforma = new Map<string, Map<string, { g: number; n: number }>>();
    for (const h of historia.rows) {
      const plataforma = resolverPlataforma(h.utm_source, mapa);
      const clave = `${h.pais}|${plataforma}`;
      const porSemana = histPorPlataforma.get(clave) ?? new Map();
      const v = porSemana.get(h.semana) ?? { g: 0, n: 0 };
      v.n += Number(h.pacientes_nuevos);
      porSemana.set(h.semana, v);
      histPorPlataforma.set(clave, porSemana);
    }

    const filas: FilaPlataforma[] = [];

    // Only platforms with spend or traffic, and only real ones: a verdict on
    // "Sin utm" would be a verdict on everything nobody tagged.
    for (const [clave, acc] of porPlataforma) {
      const [paisFila, plataforma] = clave.split("|") as [string, string];
      const gasto = gastoPorClave.get(clave) ?? 0;
      if (gasto === 0 && acc.registros === 0) continue;

      const conversion = acc.registros > 0 ? acc.convertidos / acc.registros : null;
      const cac = acc.nuevos > 0 && gasto > 0 ? gasto / acc.nuevos : null;
      const ltvPais = ltvPorPais.get(paisFila) ?? null;
      const ratio = cac !== null && ltvPais !== null ? ltvPais / cac : null;

      const campanas: FilaUtm[] = [...acc.campanas.entries()]
        .map(([utm_source, c]) => {
          const conv = c.registros > 0 ? c.convertidos / c.registros : null;
          return {
            utm_source: utm_source === "" ? "(sin tag)" : utm_source,
            registros: c.registros,
            pacientes_nuevos: c.nuevos,
            conversion: conv,
            // Below its platform's rate by enough to matter, with the volume
            // to mean it. Under the minimum sample nothing is marked.
            alerta:
              conv !== null &&
              conversion !== null &&
              c.registros >= MUESTRA_MINIMA &&
              conv < conversion * UMBRAL_ALERTA,
          };
        })
        .sort((a, b) => b.registros - a.registros);

      const porSemana = histPorPlataforma.get(clave);
      const historiaRatio = porSemana
        ? [...porSemana.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([, v]) => (v.n > 0 && ltvPais !== null ? ltvPais / (gasto / v.n) : 0))
            .filter((r) => r > 0)
        : [];

      filas.push({
        plataforma,
        pais: paisFila,
        gasto,
        registros: acc.registros,
        pacientes_nuevos: acc.nuevos,
        conversion,
        cac,
        ratio,
        historia: historiaRatio,
        campanas,
      });
    }

    filas.sort((a, b) => b.gasto - a.gasto || b.registros - a.registros);

    const totalGasto = filas.reduce((a, f) => a + f.gasto, 0);
    const totalNuevos = filas.reduce((a, f) => a + f.pacientes_nuevos, 0);

    return {
      semanas: disponibles,
      semana: elegida,
      filas,
      totalGasto,
      totalRegistros: filas.reduce((a, f) => a + f.registros, 0),
      totalNuevos,
      cacMedio: totalNuevos > 0 && totalGasto > 0 ? totalGasto / totalNuevos : null,
      ltv: [...ltvPorPais.entries()].map(([p, v]) => ({ pais: p, valor: v })),
    };
  });
}
