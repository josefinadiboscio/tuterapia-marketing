import type { Connection } from "mysql2/promise";
import type { Client } from "pg";
import { PAISES, type Pais } from "@/lib/queries/shared";
import { curvaConversion } from "@/lib/queries/conversion";
import {
  registrosPorDia,
  registrosPorDiaYSource,
  pacientesNuevosPorDia,
  conversionPorDia,
  ultimosDias,
  type PorDia,
} from "@/lib/queries/diarias";
import { conversion } from "@/lib/metrics";
import { resolverPlataforma, type UtmMapping } from "@/lib/utm";
import { transaction } from "@/lib/db";

export const DIAS_A_SINCRONIZAR = 45;

type FilaDiaria = {
  fecha: string;
  pais: string;
  plataforma: string;
  registros: number | null;
  pacientes_nuevos: number | null;
  conversion: number | null;
  conversion_proyectada: boolean;
  cohorte_edad_dias: number | null;
};

/**
 * Writes the daily grain for the last 45 days, in one transaction.
 *
 * A 45-day window rather than only the days that changed: a late payment moves
 * the conversion of a day up to 30 days back, so a narrower window would leave
 * those days frozen at whatever they looked like the first time.
 */
export async function sincronizarDias(
  mysql: Connection,
  db: Client,
  dias = DIAS_A_SINCRONIZAR,
  ahora = new Date(),
): Promise<number> {
  const { rows: mapping } = await db.query<UtmMapping>(
    "select patron, plataforma, superficie, es_pago, orden from marketing.utm_mapping",
  );

  const rango = ultimosDias(dias, ahora);
  const filas: FilaDiaria[] = [];
  const totales = new Map<string, FilaDiaria>();

  for (const pais of PAISES as readonly Pais[]) {
    const [registros, porSource, nuevos, conversiones, curva] = await Promise.all([
      registrosPorDia(mysql, rango, pais),
      registrosPorDiaYSource(mysql, rango, pais),
      pacientesNuevosPorDia(mysql, rango, pais),
      conversionPorDia(mysql, rango, pais),
      curvaConversion(mysql, pais),
    ]);

    const porFecha = indexar(registros);
    const nuevosPorFecha = indexar(nuevos);

    for (const dia of conversiones) {
      const edad = edadEnDias(dia.dia, ahora);
      const conv = conversion(dia.registros, dia.convertidos, edad, curva);

      const fila: FilaDiaria = {
        fecha: dia.dia,
        pais,
        plataforma: "TODAS",
        registros: porFecha.get(dia.dia) ?? 0,
        pacientes_nuevos: nuevosPorFecha.get(dia.dia) ?? 0,
        conversion: conv.valor,
        conversion_proyectada: conv.proyectada,
        cohorte_edad_dias: edad,
      };
      filas.push(fila);
      acumularTotal(totales, fila);
    }

    // Platform rows carry volume only: a conversion split by platform on a
    // single day rests on a handful of registrations.
    const porPlataforma = new Map<string, number>();
    for (const fila of porSource) {
      const clave = `${fila.dia}|${resolverPlataforma(fila.utm_source, mapping)}`;
      porPlataforma.set(clave, (porPlataforma.get(clave) ?? 0) + fila.n);
    }
    for (const [clave, n] of porPlataforma) {
      const [fecha, plataforma] = clave.split("|");
      filas.push({
        fecha: fecha!,
        pais,
        plataforma: plataforma!,
        registros: n,
        pacientes_nuevos: null,
        conversion: null,
        conversion_proyectada: false,
        cohorte_edad_dias: null,
      });
    }
  }

  filas.push(...totales.values());

  await transaction(db, async () => {
    for (const fila of filas) await upsert(db, fila);
  });

  return filas.length;
}

function indexar(filas: PorDia[]): Map<string, number> {
  return new Map(filas.map((f) => [f.dia, f.n]));
}

/**
 * The TOTAL row adds the countable parts and recomputes the rate from the
 * summed cohort, never from an average of two percentages.
 */
function acumularTotal(totales: Map<string, FilaDiaria>, fila: FilaDiaria) {
  const previo = totales.get(fila.fecha);
  if (!previo) {
    totales.set(fila.fecha, { ...fila, pais: "TOTAL" });
    return;
  }
  previo.registros = (previo.registros ?? 0) + (fila.registros ?? 0);
  previo.pacientes_nuevos =
    (previo.pacientes_nuevos ?? 0) + (fila.pacientes_nuevos ?? 0);
  // Weighted by registrations, which is the cohort each rate is over.
  const pesoPrevio = previo.registros - (fila.registros ?? 0);
  if (previo.conversion !== null && fila.conversion !== null && previo.registros > 0) {
    previo.conversion =
      (previo.conversion * pesoPrevio + fila.conversion * (fila.registros ?? 0)) /
      previo.registros;
  }
  previo.conversion_proyectada =
    previo.conversion_proyectada || fila.conversion_proyectada;
}

function edadEnDias(fecha: string, ahora: Date): number {
  const dia = Date.parse(`${fecha}T00:00:00Z`);
  const hoy = Date.parse(
    new Date(ahora.getTime() - 3 * 3600_000).toISOString().slice(0, 10) +
      "T00:00:00Z",
  );
  return Math.max(0, Math.round((hoy - dia) / 86_400_000));
}

async function upsert(db: Client, fila: FilaDiaria): Promise<void> {
  await db.query(
    `insert into marketing.metricas_diarias
       (fecha, pais, plataforma, registros, pacientes_nuevos, conversion,
        conversion_proyectada, cohorte_edad_dias, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (fecha, pais, plataforma) do update set
       registros = excluded.registros,
       pacientes_nuevos = excluded.pacientes_nuevos,
       conversion = excluded.conversion,
       conversion_proyectada = excluded.conversion_proyectada,
       cohorte_edad_dias = excluded.cohorte_edad_dias,
       actualizado_en = now()`,
    [
      fila.fecha,
      fila.pais,
      fila.plataforma,
      fila.registros,
      fila.pacientes_nuevos,
      fila.conversion,
      fila.conversion_proyectada,
      fila.cohorte_edad_dias,
    ],
  );
}
