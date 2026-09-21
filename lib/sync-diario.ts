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
import { sesionesPorDiaYModalidad } from "@/lib/queries/sesiones";
import {
  pacientesNuevosPorDiaYSource,
  pacientesActivosPorDiaYSource,
  conversionPorDiaYSource,
} from "@/lib/queries/por-source";
import { conversion } from "@/lib/metrics";
import { resolverPlataforma, type UtmMapping } from "@/lib/utm";
import { transaction } from "@/lib/db";

export const DIAS_A_SINCRONIZAR = 45;

/**
 * Las sesiones se guardan sobre una ventana más larga que el resto.
 *
 * El panel de sesiones necesita el cierre del mes anterior completo y el
 * patrón semanal de varios meses para proyectar. Con 45 días no alcanza
 * ninguno de los dos. Es UNA consulta agrupada que devuelve unos cientos de
 * filas ya reducidas, así que el costo es casi el mismo.
 */
export const DIAS_DE_SESIONES = 120;

type FilaDiaria = {
  fecha: string;
  pais: string;
  plataforma: string;
  registros: number | null;
  pacientes_nuevos: number | null;
  pacientes_activos: number | null;
  sesiones_realizadas: number | null;
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
  // Una sola consulta para los tres ejes y los 120 días, fuera del loop por
  // país. De acá salen las dos cosas: el grano con modalidad y la columna
  // `sesiones_realizadas` de metricas_diarias, que es su suma. Un solo origen,
  // así que no se pueden contradecir.
  const sesiones = await sesionesPorDiaYModalidad(
    mysql,
    ultimosDias(DIAS_DE_SESIONES, ahora),
  );
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
    // El total del día sale de la MISMA consulta que el grano con modalidad,
    // sumando las tres. Antes era una consulta aparte por país: dos números
    // para el mismo hecho, que es como empiezan a diferir.
    const sesionesPorFecha = new Map<string, number>();
    for (const f of sesiones) {
      if (f.pais !== pais) continue;
      sesionesPorFecha.set(f.dia, (sesionesPorFecha.get(f.dia) ?? 0) + f.sesiones);
    }

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
        sesiones_realizadas: sesionesPorFecha.get(dia.dia) ?? 0,
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
        // Sessions are not split by platform: margin belongs to the country.
        sesiones_realizadas: null,
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

    // El grano con modalidad. En bloque y no fila por fila: son unas 700 filas
    // (120 días × 2 países × 3 modalidades) y de a una serían 700 ida y
    // vuelta adentro de una transacción que corre contra un techo de 60s.
    if (sesiones.length > 0) {
      await db.query(
        `insert into marketing.sesiones_diarias (fecha, pais, modalidad, sesiones)
         select * from unnest($1::date[], $2::text[], $3::text[], $4::int[])
         on conflict (fecha, pais, modalidad) do update set
           sesiones = excluded.sesiones,
           actualizado_en = now()`,
        [
          sesiones.map((f) => f.dia),
          sesiones.map((f) => f.pais),
          sesiones.map((f) => f.modalidad),
          sesiones.map((f) => f.sesiones),
        ],
      );
    }
  });

  return filas.length + sesiones.length;
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
  if (fila.sesiones_realizadas !== null) {
    previo.sesiones_realizadas =
      (previo.sesiones_realizadas ?? 0) + fila.sesiones_realizadas;
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
        sesiones_realizadas, conversion, conversion_proyectada,
        cohorte_edad_dias, actualizado_en)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (fecha, pais, plataforma) do update set
       registros = excluded.registros,
       pacientes_nuevos = excluded.pacientes_nuevos,
       pacientes_activos = excluded.pacientes_activos,
       sesiones_realizadas = excluded.sesiones_realizadas,
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
      fila.sesiones_realizadas,
      fila.conversion,
      fila.conversion_proyectada,
      fila.cohorte_edad_dias,
    ],
  );
}
