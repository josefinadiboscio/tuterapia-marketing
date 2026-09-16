import { withDb } from "@/lib/db";
import { PAISES_REALES } from "@/lib/dashboard";

/**
 * What the two General charts draw, and what their tooltips show.
 *
 * The bars are stacked by platform, which is the readable grouping: six
 * colours, stable from render to render. The tooltip is the raw `utm_source`
 * exactly as the database holds it — metaarj7, tkarg, gadspre — because that
 * is the string somebody typed into a campaign and the only one they can go
 * and find. Grouping it would answer a question the bars already answer.
 *
 * Both come from the same rows, so a tooltip can never disagree with the bar
 * it is describing.
 */

export type MetricaSerie = "registros" | "nuevos" | "activos" | "conversion";

/** The column each metric reads, at both grains. */
const COLUMNA: Record<Exclude<MetricaSerie, "conversion">, string> = {
  registros: "registros",
  nuevos: "pacientes_nuevos",
  activos: "pacientes_activos",
};

export type Punto = { periodo: string; clave: string; valor: number };

export type Desglose = {
  /** By platform, for the stacked bars. */
  barras: Punto[];
  plataformas: string[];
  /** By raw utm_source, for the tooltip. */
  utm: Punto[];
};

/**
 * Conversion is a rate, so it is never summed across sources: the tooltip
 * shows each source's own rate and the bars are not stacked for it.
 */
function esRate(metrica: MetricaSerie): metrica is "conversion" {
  return metrica === "conversion";
}

/** The last `dias` days, by platform and by source. */
export async function leerDesgloseDiario(
  pais: string,
  metrica: MetricaSerie,
  dias = 30,
): Promise<Desglose> {
  const paises = pais === "TOTAL" ? [...PAISES_REALES] : [pais];

  return withDb(async (db) => {
    const corte = `fecha > (select coalesce(max(fecha), current_date)
                              from marketing.metricas_diarias) - $2::int`;

    const barras = esRate(metrica)
      ? await db.query<{ periodo: string; clave: string; valor: string }>(
          `select fecha::text as periodo, plataforma as clave,
                  (sum(registros * conversion) / nullif(sum(registros), 0))::text as valor
             from marketing.metricas_diarias
            where pais = any($1) and plataforma <> 'TODAS' and conversion is not null
              and ${corte}
            group by fecha, plataforma order by fecha`,
          [paises, dias],
        )
      : await db.query<{ periodo: string; clave: string; valor: string }>(
          `select fecha::text as periodo, plataforma as clave,
                  sum(${COLUMNA[metrica]})::text as valor
             from marketing.metricas_diarias
            where pais = any($1) and plataforma <> 'TODAS'
              and ${COLUMNA[metrica]} is not null and ${corte}
            group by fecha, plataforma order by fecha`,
          [paises, dias],
        );

    const corteUtm = `fecha > (select coalesce(max(fecha), current_date)
                                 from marketing.metricas_utm) - $2::int`;

    const utm = esRate(metrica)
      ? await db.query<{ periodo: string; clave: string; valor: string }>(
          `select fecha::text as periodo, utm_source as clave,
                  (sum(convertidos)::numeric / nullif(sum(registros), 0))::text as valor
             from marketing.metricas_utm
            where pais = any($1) and ${corteUtm}
            group by fecha, utm_source order by fecha`,
          [paises, dias],
        )
      : await db.query<{ periodo: string; clave: string; valor: string }>(
          `select fecha::text as periodo, utm_source as clave,
                  sum(${COLUMNA[metrica]})::text as valor
             from marketing.metricas_utm
            where pais = any($1) and ${COLUMNA[metrica]} is not null and ${corteUtm}
            group by fecha, utm_source order by fecha`,
          [paises, dias],
        );

    return armar(barras.rows, utm.rows);
  });
}

/** The last `meses` months, by platform and by source. */
export async function leerDesgloseMensual(
  pais: string,
  metrica: MetricaSerie,
  meses: number,
): Promise<Desglose> {
  const paises = pais === "TOTAL" ? [...PAISES_REALES] : [pais];

  return withDb(async (db) => {
    const barras = esRate(metrica)
      ? await db.query<{ periodo: string; clave: string; valor: string }>(
          `select to_char(mes, 'YYYY-MM') as periodo, plataforma as clave,
                  (sum(registros * conversion_cohorte)
                     / nullif(sum(registros), 0))::text as valor
             from marketing.metricas_mensuales
            where pais = any($1) and plataforma <> 'TODAS'
              and conversion_cohorte is not null
              and mes >= (date_trunc('month', current_date)
                          - make_interval(months => $2::int - 1))
            group by mes, plataforma order by mes`,
          [paises, meses],
        )
      : await db.query<{ periodo: string; clave: string; valor: string }>(
          `select to_char(mes, 'YYYY-MM') as periodo, plataforma as clave,
                  sum(${COLUMNA[metrica]})::text as valor
             from marketing.metricas_mensuales
            where pais = any($1) and plataforma <> 'TODAS'
              and ${COLUMNA[metrica]} is not null
              and mes >= (date_trunc('month', current_date)
                          - make_interval(months => $2::int - 1))
            group by mes, plataforma order by mes`,
          [paises, meses],
        );

    const utm = esRate(metrica)
      ? await db.query<{ periodo: string; clave: string; valor: string }>(
          `select to_char(mes, 'YYYY-MM') as periodo, utm_source as clave,
                  (sum(convertidos)::numeric / nullif(sum(registros), 0))::text as valor
             from marketing.metricas_utm_mensual
            where pais = any($1)
              and mes >= (date_trunc('month', current_date)
                          - make_interval(months => $2::int - 1))
            group by mes, utm_source order by mes`,
          [paises, meses],
        )
      : await db.query<{ periodo: string; clave: string; valor: string }>(
          `select to_char(mes, 'YYYY-MM') as periodo, utm_source as clave,
                  sum(${COLUMNA[metrica]})::text as valor
             from marketing.metricas_utm_mensual
            where pais = any($1) and ${COLUMNA[metrica]} is not null
              and mes >= (date_trunc('month', current_date)
                          - make_interval(months => $2::int - 1))
            group by mes, utm_source order by mes`,
          [paises, meses],
        );

    return armar(barras.rows, utm.rows);
  });
}

function armar(
  barras: { periodo: string; clave: string; valor: string }[],
  utm: { periodo: string; clave: string; valor: string }[],
): Desglose {
  const aPunto = (r: { periodo: string; clave: string; valor: string }) => ({
    periodo: r.periodo,
    // '' is traffic that arrived with no tag. A real bucket, not a gap.
    clave: r.clave === "" ? "(sin tag)" : r.clave,
    valor: Number(r.valor),
  });

  const filas = barras.map(aPunto);

  // Platforms ordered by volume, so the stack does not reshuffle between
  // renders and the brand orange lands on the biggest one.
  const totales = new Map<string, number>();
  for (const f of filas) totales.set(f.clave, (totales.get(f.clave) ?? 0) + f.valor);

  return {
    barras: filas,
    plataformas: [...totales.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([n]) => n),
    utm: utm.map(aPunto),
  };
}
