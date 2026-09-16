import { withDb } from "@/lib/db";

/**
 * Funnel reads the stages that exist in the aggregate table.
 *
 * Registros, Compraron (first confirmed payment) and 1ª sesión (activados) are
 * stored. The second session is not: nothing counts it, and neither does the
 * session-to-session grid the cohort view needs. Those stages render as
 * missing rather than as zero, because zero would read as "nobody came back".
 */
export type Etapa = {
  nombre: string;
  valor: number | null;
  /** What is missing, when the stage cannot be measured yet. */
  falta?: string;
};

export type VistaFunnel = {
  mes: string | null;
  etapas: Etapa[];
  medianaCompra: number | null;
  p80Compra: number | null;
  noShow: number | null;
  meses: string[];
};

export async function leerFunnel(
  pais: string,
  mes?: string,
): Promise<VistaFunnel> {
  return withDb(async (db) => {
    const { rows: meses } = await db.query<{ mes: string }>(
      `select distinct to_char(mes, 'YYYY-MM') as mes
         from marketing.metricas_mensuales
        where es_provisorio = false order by mes desc limit 12`,
    );
    const disponibles = meses.map((m) => m.mes);
    const elegido = mes && disponibles.includes(mes) ? mes : disponibles[0] ?? null;
    if (!elegido) {
      return {
        mes: null,
        etapas: [],
        medianaCompra: null,
        p80Compra: null,
        noShow: null,
        meses: [],
      };
    }

    const { rows } = await db.query<{
      registros: number;
      pacientes_nuevos: number;
      pacientes_activados: number | null;
      mediana_dias_compra: string | null;
      p80_dias_compra: string | null;
    }>(
      `select registros, pacientes_nuevos, pacientes_activados,
              mediana_dias_compra::text, p80_dias_compra::text
         from marketing.metricas_mensuales
        where pais = $1 and plataforma = 'TODAS'
          and to_char(mes, 'YYYY-MM') = $2`,
      [pais, elegido],
    );

    const fila = rows[0];
    const activados = fila?.pacientes_activados ?? null;
    const nuevos = fila?.pacientes_nuevos ?? null;

    return {
      mes: elegido,
      etapas: [
        { nombre: "Registros", valor: fila?.registros ?? null },
        { nombre: "Compraron", valor: nuevos },
        { nombre: "1ª sesión", valor: activados },
        {
          nombre: "2ª sesión",
          valor: null,
          falta: "nadie la cuenta todavía",
        },
      ],
      medianaCompra:
        fila?.mediana_dias_compra === null || fila?.mediana_dias_compra === undefined
          ? null
          : Number(fila.mediana_dias_compra),
      p80Compra:
        fila?.p80_dias_compra === null || fila?.p80_dias_compra === undefined
          ? null
          : Number(fila.p80_dias_compra),
      // The gap between paying and sitting down is the no-show.
      noShow:
        nuevos && activados !== null && nuevos > 0
          ? Math.max(0, (nuevos - activados) / nuevos)
          : null,
      meses: disponibles,
    };
  });
}
