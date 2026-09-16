import { withDb } from "@/lib/db";

/** One month of the General series. */
export type MesSerie = {
  mes: string;
  registros: number | null;
  pacientes_nuevos: number | null;
  pacientes_activos: number | null;
  conversion_cohorte: number | null;
  cac_usd: number | null;
  costo_por_registro_usd: number | null;
  ltv_usd: number | null;
  /** The LTV multiplier: sessions an average patient of the cohort does. */
  sesiones_por_paciente: number | null;
  /** Lifetime sessions per patient across the whole base, as of this month. */
  sesiones_historico: number | null;
  es_provisorio: boolean;
  /** How many days of the month the provisional row covers. */
  tramo_dias: number | null;
  /** The same stretch of the previous month, for a like-for-like delta. */
  registros_tramo_previo: number | null;
  pacientes_nuevos_tramo_previo: number | null;
};

export type VistaGeneral = {
  serie: MesSerie[];
  /** Filled only when the selection is TOTAL: economy never averages. */
  porPais: { pais: string; serie: MesSerie[] }[];
  plataformas: { plataforma: string; registros: number }[];
  ultimaSync: { corrida_en: string; error: string | null } | null;
  meses: string[];
};

export const RANGOS = [3, 6, 12] as const;
export type Rango = (typeof RANGOS)[number];

export const PAISES_REALES = ["AR", "UY"] as const;

/**
 * General reads a series, not a month: the screen answers "where is this
 * going", and a single month cannot answer that.
 *
 * With TOTAL selected the volume block reads the stored TOTAL row, which adds
 * the countries, but the economy block reads both countries separately. A
 * blended CAC or LTV moves with the spend mix alone: commission, duration and
 * LTV differ enough between the two markets that the average describes
 * neither.
 *
 * Everything still comes out of marketing.metricas_mensuales, so a number here
 * can never disagree with the same number anywhere else.
 */
export async function leerGeneral(
  pais: string,
  meses: Rango,
): Promise<VistaGeneral> {
  return withDb(async (db) => {
    const [serie, disponibles, sync] = await Promise.all([
      db.query<MesSerie & { registros: string }>(
        `select to_char(mes, 'YYYY-MM') as mes, registros, pacientes_nuevos,
                pacientes_activos, conversion_cohorte, cac_usd,
                costo_por_registro_usd, ltv_usd, sesiones_historico,
                es_provisorio,
                tramo_dias, registros_tramo_previo,
                pacientes_nuevos_tramo_previo
           from marketing.metricas_mensuales
          where pais = $1 and plataforma = 'TODAS'
          order by mes desc limit $2`,
        [pais, meses],
      ),
      db.query<{ mes: string }>(
        `select distinct to_char(mes, 'YYYY-MM') as mes
           from marketing.metricas_mensuales order by mes desc`,
      ),
      db.query<{ corrida_en: string; error: string | null }>(
        `select corrida_en, error from marketing.sync_log
          order by corrida_en desc limit 1`,
      ),
    ]);

    const ordenada = serie.rows.map(normalizar).reverse();
    const ultimo = ordenada[ordenada.length - 1]?.mes;

    const porPais =
      pais === "TOTAL"
        ? await Promise.all(
            PAISES_REALES.map(async (p) => {
              const { rows } = await db.query(
                `select to_char(mes, 'YYYY-MM') as mes, registros, pacientes_nuevos,
                        pacientes_activos, conversion_cohorte, cac_usd,
                        costo_por_registro_usd, ltv_usd, sesiones_historico,
                es_provisorio,
                tramo_dias, registros_tramo_previo,
                pacientes_nuevos_tramo_previo
                   from marketing.metricas_mensuales
                  where pais = $1 and plataforma = 'TODAS'
                  order by mes desc limit $2`,
                [p, meses],
              );
              return { pais: p, serie: rows.map(normalizar).reverse() };
            }),
          )
        : [];

    const plataformas = ultimo
      ? await db.query<{ plataforma: string; registros: number }>(
          `select plataforma, registros
             from marketing.metricas_mensuales
            where pais = $1 and plataforma <> 'TODAS'
              and to_char(mes, 'YYYY-MM') = $2 and registros is not null
            order by registros desc`,
          [pais, ultimo],
        )
      : { rows: [] };

    return {
      serie: ordenada,
      porPais,
      plataformas: plataformas.rows.map((p) => ({
        plataforma: p.plataforma,
        registros: Number(p.registros),
      })),
      ultimaSync: sync.rows[0] ?? null,
      meses: disponibles.rows.map((r) => r.mes),
    };
  });
}

/**
 * The last sync, on its own, for the header.
 *
 * Every screen shows the stamp, so every screen needs it: leaving it to the
 * one reader that happened to return it left four tabs claiming there had
 * never been a sync.
 */
export async function leerUltimaSync(): Promise<{
  corrida_en: string;
  error: string | null;
} | null> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ corrida_en: string; error: string | null }>(
      `select corrida_en, error from marketing.sync_log
        order by corrida_en desc limit 1`,
    );
    return rows[0] ?? null;
  });
}

/** Postgres numerics arrive as strings; nulls have to survive the trip. */
function normalizar(fila: Record<string, unknown>): MesSerie {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    mes: String(fila.mes),
    registros: num(fila.registros),
    pacientes_nuevos: num(fila.pacientes_nuevos),
    pacientes_activos: num(fila.pacientes_activos),
    conversion_cohorte: num(fila.conversion_cohorte),
    cac_usd: num(fila.cac_usd),
    costo_por_registro_usd: num(fila.costo_por_registro_usd),
    ltv_usd: num(fila.ltv_usd),
    sesiones_por_paciente: num(fila.sesiones_por_paciente),
    sesiones_historico: num(fila.sesiones_historico),
    es_provisorio: Boolean(fila.es_provisorio),
    tramo_dias: num(fila.tramo_dias),
    registros_tramo_previo: num(fila.registros_tramo_previo),
    pacientes_nuevos_tramo_previo: num(fila.pacientes_nuevos_tramo_previo),
  };
}
