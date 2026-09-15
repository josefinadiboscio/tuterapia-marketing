import { withDb } from "@/lib/db";

/** A row of marketing.metricas_mensuales as the dashboard reads it. */
export type Metricas = {
  mes: string;
  pais: string;
  plataforma: string;
  registros: number | null;
  pacientes_nuevos: number | null;
  pacientes_activos: number | null;
  conversion_cohorte: number | null;
  conversion_proyectada: boolean;
  cohorte_edad_dias: number | null;
  mediana_dias_compra: number | null;
  p80_dias_compra: number | null;
  es_provisorio: boolean;
  registros_tramo_previo: number | null;
  pacientes_nuevos_tramo_previo: number | null;
  pacientes_activos_tramo_previo: number | null;
  tramo_dias: number | null;
};

export type Vista = {
  meses: string[];
  actual: Metricas | null;
  previo: Metricas | null;
  plataformas: { plataforma: string; registros: number }[];
  ultimaSync: { corrida_en: string; error: string | null } | null;
};

/**
 * Everything the General tab needs, in one connection.
 *
 * Reads only from the aggregate table: if a number shows up in two tabs it
 * comes from the same row, never recomputed on the side.
 */
export async function leerVista(pais: string, mes?: string): Promise<Vista> {
  return withDb(async (db) => {
    const { rows: meses } = await db.query<{ mes: string }>(
      `select distinct to_char(mes, 'YYYY-MM') as mes
         from marketing.metricas_mensuales
        order by mes desc`,
    );
    const disponibles = meses.map((r) => r.mes);
    const elegido = mes && disponibles.includes(mes) ? mes : disponibles[0];

    if (!elegido) {
      return { meses: [], actual: null, previo: null, plataformas: [], ultimaSync: null };
    }

    const previo = mesAnterior(elegido);

    const { rows: filas } = await db.query<Metricas>(
      `select to_char(mes, 'YYYY-MM') as mes, pais, plataforma, registros,
              pacientes_nuevos, pacientes_activos, conversion_cohorte,
              conversion_proyectada, cohorte_edad_dias, mediana_dias_compra,
              p80_dias_compra, es_provisorio, registros_tramo_previo,
              pacientes_nuevos_tramo_previo, pacientes_activos_tramo_previo,
              tramo_dias
         from marketing.metricas_mensuales
        where pais = $1 and plataforma = 'TODAS'
          and to_char(mes, 'YYYY-MM') in ($2, $3)`,
      [pais, elegido, previo],
    );

    const { rows: plataformas } = await db.query<{
      plataforma: string;
      registros: number;
    }>(
      `select plataforma, registros
         from marketing.metricas_mensuales
        where pais = $1 and plataforma <> 'TODAS'
          and to_char(mes, 'YYYY-MM') = $2 and registros is not null
        order by registros desc`,
      [pais, elegido],
    );

    const { rows: sync } = await db.query<{
      corrida_en: string;
      error: string | null;
    }>(
      `select corrida_en, error from marketing.sync_log
        order by corrida_en desc limit 1`,
    );

    return {
      meses: disponibles,
      actual: filas.find((f) => f.mes === elegido) ?? null,
      previo: filas.find((f) => f.mes === previo) ?? null,
      plataformas,
      ultimaSync: sync[0] ?? null,
    };
  });
}

function mesAnterior(mes: string): string {
  const [year, month] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
