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
import {
  pacientesNuevosPorDiaYSource,
  pacientesActivosPorDiaYSource,
  conversionPorDiaYSource,
} from "@/lib/queries/por-source";
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
  pacientes_activos: number | null;
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
  // The campaign grain, kept unaggregated: Ads reads the platform level as the
  // sum of its sources, so both levels come from this one table.
  const utm: {
    fecha: string;
    pais: string;
    utm_source: string;
    registros: number | null;
    nuevos: number | null;
    convertidos: number | null;
  }[] = [];

  for (const pais of PAISES as readonly Pais[]) {
    const [
      registros,
      porSource,
      nuevos,
      conversiones,
      curva,
      nuevosSource,
      activosSource,
      convSource,
    ] = await Promise.all([
      registrosPorDia(mysql, rango, pais),
      registrosPorDiaYSource(mysql, rango, pais),
      pacientesNuevosPorDia(mysql, rango, pais),
      conversionPorDia(mysql, rango, pais),
      curvaConversion(mysql, pais),
      pacientesNuevosPorDiaYSource(mysql, rango, pais),
      pacientesActivosPorDiaYSource(mysql, rango, pais),
      conversionPorDiaYSource(mysql, rango, pais),
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
        pacientes_activos: null,
        conversion: conv.valor,
        conversion_proyectada: conv.proyectada,
        cohorte_edad_dias: edad,
      };
      filas.push(fila);
      acumularTotal(totales, fila);
    }

    // Platform rows now carry the same four metrics as the country row, so the
    // General charts can stack whichever one the card selects.
    //
    // A day's conversion for one platform rests on a handful of registrations,
    // so it is projected through the same maturity curve as the country's and
    // marked as projected. It is a shape, not a number to quote.
    const sumar = (
      destino: Map<string, number>,
      filas: { dia: string; utm_source: string; n: number }[],
    ) => {
      for (const f of filas) {
        const clave = `${f.dia}|${resolverPlataforma(f.utm_source, mapping)}`;
        destino.set(clave, (destino.get(clave) ?? 0) + f.n);
      }
    };

    const crudo = new Map<
      string,
      { registros: number | null; nuevos: number | null; convertidos: number | null }
    >();
    const tocar = (dia: string, source: string) => {
      const clave = `${dia}|${source}`;
      let v = crudo.get(clave);
      if (!v) {
        v = { registros: null, nuevos: null, convertidos: null };
        crudo.set(clave, v);
      }
      return v;
    };
    for (const f of porSource) tocar(f.dia, f.utm_source).registros = f.n;
    for (const f of nuevosSource) tocar(f.dia, f.utm_source).nuevos = f.n;
    for (const f of convSource) {
      const v = tocar(f.dia, f.utm_source);
      v.registros = f.registros;
      v.convertidos = f.convertidos;
    }
    for (const [clave, v] of crudo) {
      const [fecha, source] = clave.split("|");
      utm.push({
        fecha: fecha!,
        pais,
        utm_source: source!,
        registros: v.registros,
        nuevos: v.nuevos,
        convertidos: v.convertidos,
      });
    }

    const regPlat = new Map<string, number>();
    const nuevosPlat = new Map<string, number>();
    const activosPlat = new Map<string, number>();
    sumar(regPlat, porSource);
    sumar(nuevosPlat, nuevosSource);
    sumar(activosPlat, activosSource);

    const convPlat = new Map<string, { registros: number; convertidos: number }>();
    for (const f of convSource) {
      const clave = `${f.dia}|${resolverPlataforma(f.utm_source, mapping)}`;
      const acc = convPlat.get(clave) ?? { registros: 0, convertidos: 0 };
      acc.registros += f.registros;
      acc.convertidos += f.convertidos;
      convPlat.set(clave, acc);
    }

    for (const clave of new Set([
      ...regPlat.keys(),
      ...nuevosPlat.keys(),
      ...activosPlat.keys(),
    ])) {
      const [fecha, plataforma] = clave.split("|");
      const edad = edadEnDias(fecha!, ahora);
      const c = convPlat.get(clave);
      const conv = c
        ? conversion(c.registros, c.convertidos, edad, curva)
        : { valor: null, proyectada: false };

      filas.push({
        fecha: fecha!,
        pais,
        plataforma: plataforma!,
        registros: regPlat.get(clave) ?? null,
        pacientes_nuevos: nuevosPlat.get(clave) ?? null,
        pacientes_activos: activosPlat.get(clave) ?? null,
        conversion: conv.valor,
        conversion_proyectada: conv.proyectada,
        cohorte_edad_dias: edad,
      });
    }
  }

  filas.push(...totales.values());

  await transaction(db, async () => {
    for (const fila of filas) await upsert(db, fila);

    for (const u of utm) {
      await db.query(
        `insert into marketing.metricas_utm
           (fecha, pais, utm_source, registros, pacientes_nuevos, convertidos)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (fecha, pais, utm_source) do update set
           registros = excluded.registros,
           pacientes_nuevos = excluded.pacientes_nuevos,
           convertidos = excluded.convertidos,
           actualizado_en = now()`,
        [u.fecha, u.pais, u.utm_source, u.registros, u.nuevos, u.convertidos],
      );
    }
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
  if (fila.pacientes_activos !== null) {
    previo.pacientes_activos =
      (previo.pacientes_activos ?? 0) + fila.pacientes_activos;
  }
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
       (fecha, pais, plataforma, registros, pacientes_nuevos, pacientes_activos,
        conversion, conversion_proyectada, cohorte_edad_dias, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (fecha, pais, plataforma) do update set
       registros = excluded.registros,
       pacientes_nuevos = excluded.pacientes_nuevos,
       pacientes_activos = excluded.pacientes_activos,
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
      fila.pacientes_activos,
      fila.conversion,
      fila.conversion_proyectada,
      fila.cohorte_edad_dias,
    ],
  );
}
