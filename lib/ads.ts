import { withDb } from "@/lib/db";

/**
 * Ads reads the grain that exists today: spend is loaded per week, country and
 * channel, and registrations come from the daily table summed over the week.
 *
 * Conversion, CAC and the ratio are NOT available at this grain. The daily
 * table carries registros per platform but not pacientes nuevos, and there is
 * no LTV per platform, so a verdict would be an opinion with nothing under it.
 * The screen shows what it has and says what is missing, which is the whole
 * point of having five verdicts instead of three.
 */
export type FilaAds = {
  campana: string;
  pais: string;
  plataforma: string;
  gasto: number;
  registros: number | null;
  /** null until spend and new patients exist at this grain. */
  conversion: number | null;
  cac: number | null;
  ratio: number | null;
  historia: number[];
};

export type VistaAds = {
  semanas: string[];
  semana: string | null;
  filas: FilaAds[];
  totalGasto: number;
  totalRegistros: number | null;
};

export async function leerAds(
  pais: string,
  semana?: string,
): Promise<VistaAds> {
  return withDb(async (db) => {
    const { rows: semanas } = await db.query<{ semana: string; cerrada: boolean }>(
      // A week still in progress already has its spend loaded but only part of
      // its registrations, so every ratio in it reads low. The default lands on
      // the last week the daily grain covers end to end; the rest stay pickable.
      `select semana::text,
              (semana + 6 <= (select max(fecha) from marketing.metricas_diarias)) as cerrada
         from marketing.gastos group by semana order by semana desc limit 26`,
    );
    const disponibles = semanas.map((s) => s.semana);
    const ultimaCerrada = semanas.find((s) => s.cerrada)?.semana;
    const elegida = semana && disponibles.includes(semana)
      ? semana
      : ultimaCerrada ?? disponibles[0] ?? null;
    if (!elegida) {
      return { semanas: [], semana: null, filas: [], totalGasto: 0, totalRegistros: null };
    }

    const filtroPais = pais === "TOTAL" ? ["AR", "UY"] : [pais];

    const { rows: gastos } = await db.query<{
      pais: string;
      canal: string;
      monto_usd: string;
    }>(
      `select pais, canal, monto_usd::text
         from marketing.gastos
        where semana = $1 and pais = any($2)
        order by monto_usd desc`,
      [elegida, filtroPais],
    );

    // Registrations for the same week, from the daily grain.
    const { rows: registros } = await db.query<{
      pais: string;
      plataforma: string;
      registros: string;
    }>(
      `select pais, plataforma, sum(registros)::text as registros
         from marketing.metricas_diarias
        where plataforma <> 'TODAS' and pais = any($2)
          and fecha >= $1::date and fecha < $1::date + 7
        group by pais, plataforma`,
      [elegida, filtroPais],
    );

    const porClave = new Map(
      registros.map((r) => [`${r.pais}|${r.plataforma}`, Number(r.registros)]),
    );

    const filas: FilaAds[] = gastos.map((g) => ({
      campana: g.canal,
      pais: g.pais,
      plataforma: g.canal,
      gasto: Number(g.monto_usd),
      registros: porClave.get(`${g.pais}|${g.canal}`) ?? null,
      conversion: null,
      cac: null,
      ratio: null,
      historia: [],
    }));

    return {
      semanas: disponibles,
      semana: elegida,
      filas,
      totalGasto: filas.reduce((a, f) => a + f.gasto, 0),
      totalRegistros: filas.some((f) => f.registros !== null)
        ? filas.reduce((a, f) => a + (f.registros ?? 0), 0)
        : null,
    };
  });
}
