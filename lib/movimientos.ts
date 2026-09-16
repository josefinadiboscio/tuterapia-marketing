import { withDb } from "@/lib/db";

/**
 * Everything Movimientos needs, anchored on the last day that has data rather
 * than on today: the job runs at night, so "the last 7 days" means the last 7
 * the job has seen.
 */
export type Resumen = {
  registros: number;
  pacientes_nuevos: number;
  conversion: number | null;
  conversion_proyectada: boolean;
};

export type Dia = {
  fecha: string;
  registros: number;
  conversion_proyectada: boolean;
};

export type PlataformaMov = {
  plataforma: string;
  registros: number;
  previos: number;
};

export type VistaMovimientos = {
  hasta: string | null;
  actual: Resumen | null;
  previo: Resumen | null;
  serie: Dia[];
  plataformas: PlataformaMov[];
};

export async function leerMovimientos(pais: string): Promise<VistaMovimientos> {
  return withDb(async (db) => {
    const { rows: ref } = await db.query<{ hoy: string }>(
      `select max(fecha)::text as hoy from marketing.metricas_diarias
        where pais = $1 and plataforma = 'TODAS'`,
      [pais],
    );
    const hasta = ref[0]?.hoy ?? null;
    if (!hasta) {
      return { hasta: null, actual: null, previo: null, serie: [], plataformas: [] };
    }

    const [resumenes, serie, plataformas] = await Promise.all([
      // Both seven-day windows in one pass. The rate is recomputed weighted by
      // registrations, never averaged across days.
      db.query<{
        ventana: string;
        registros: string;
        pacientes_nuevos: string;
        conversion: string | null;
        proyectada: boolean;
      }>(
        `select case when fecha > $2::date - 7 then 'actual' else 'previo' end as ventana,
                sum(registros)::text as registros,
                sum(pacientes_nuevos)::text as pacientes_nuevos,
                (sum(conversion * registros) / nullif(sum(registros), 0))::text as conversion,
                bool_or(conversion_proyectada) as proyectada
           from marketing.metricas_diarias
          where pais = $1 and plataforma = 'TODAS'
            and fecha > $2::date - 14 and fecha <= $2::date
          group by ventana`,
        [pais, hasta],
      ),
      db.query<{ fecha: string; registros: number; proyectada: boolean }>(
        `select fecha::text, registros, conversion_proyectada as proyectada
           from marketing.metricas_diarias
          where pais = $1 and plataforma = 'TODAS'
            and fecha > $2::date - 30 and fecha <= $2::date
          order by fecha`,
        [pais, hasta],
      ),
      db.query<{ plataforma: string; registros: string; previos: string }>(
        `select plataforma,
                sum(registros) filter (where fecha > $2::date - 7)::text as registros,
                sum(registros) filter (where fecha <= $2::date - 7)::text as previos
           from marketing.metricas_diarias
          where pais = $1 and plataforma <> 'TODAS'
            and fecha > $2::date - 14 and fecha <= $2::date
          group by plataforma
          order by sum(registros) filter (where fecha > $2::date - 7) desc nulls last`,
        [pais, hasta],
      ),
    ]);

    const leer = (ventana: string): Resumen | null => {
      const fila = resumenes.rows.find((r) => r.ventana === ventana);
      if (!fila) return null;
      return {
        registros: Number(fila.registros ?? 0),
        pacientes_nuevos: Number(fila.pacientes_nuevos ?? 0),
        conversion: fila.conversion === null ? null : Number(fila.conversion),
        conversion_proyectada: fila.proyectada,
      };
    };

    return {
      hasta,
      actual: leer("actual"),
      previo: leer("previo"),
      serie: serie.rows.map((r) => ({
        fecha: r.fecha,
        registros: Number(r.registros ?? 0),
        conversion_proyectada: r.proyectada,
      })),
      plataformas: plataformas.rows.map((p) => ({
        plataforma: p.plataforma,
        registros: Number(p.registros ?? 0),
        previos: Number(p.previos ?? 0),
      })),
    };
  });
}

/**
 * Seven-day moving average. Returns null for the first six points instead of
 * averaging a partial window — a three-day average plotted next to a seven-day
 * one is a different statistic wearing the same line.
 */
export function mediaMovil(valores: number[], ventana = 7): (number | null)[] {
  return valores.map((_, i) => {
    if (i < ventana - 1) return null;
    const trozo = valores.slice(i - ventana + 1, i + 1);
    return trozo.reduce((a, b) => a + b, 0) / ventana;
  });
}
