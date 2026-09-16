import { withDb } from "@/lib/db";
import { PAISES_REALES } from "@/lib/dashboard";

/**
 * Daily composition by platform for the middle chart of General.
 *
 * It reads registros, which is what the daily table holds per platform. The
 * monthly aggregate hides which platform a day came from, and that is exactly
 * what this chart is for.
 */
export type DiaPlataforma = {
  fecha: string;
  plataforma: string;
  registros: number;
};

export async function leerDiarioPorPlataforma(
  pais: string,
  dias = 30,
): Promise<{ filas: DiaPlataforma[]; plataformas: string[] }> {
  return withDb(async (db) => {
    const { rows } = await db.query<{
      fecha: string;
      plataforma: string;
      registros: number;
    }>(
      // The daily table only breaks platform down per country: there is no
      // TOTAL row per platform, so TOTAL adds the countries here.
      `select fecha::text, plataforma, sum(registros)::int as registros
         from marketing.metricas_diarias
        where pais = any($1) and plataforma <> 'TODAS' and registros is not null
          and fecha > (select coalesce(max(fecha), current_date) from marketing.metricas_diarias) - $2::int
        group by fecha, plataforma
        order by fecha`,
      [pais === "TOTAL" ? PAISES_REALES : [pais], dias],
    );

    const totales = new Map<string, number>();
    for (const r of rows) {
      totales.set(r.plataforma, (totales.get(r.plataforma) ?? 0) + Number(r.registros));
    }

    const plataformas = [...totales.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([nombre]) => nombre);

    return {
      filas: rows.map((r) => ({
        fecha: r.fecha,
        plataforma: r.plataforma,
        registros: Number(r.registros),
      })),
      plataformas,
    };
  });
}
