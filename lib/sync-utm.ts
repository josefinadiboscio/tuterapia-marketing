import type { Connection } from "mysql2/promise";
import type { Client } from "pg";
import {
  PAISES,
  LOCAL_UTC_OFFSET_HOURS,
  type Pais,
  type Rango,
} from "@/lib/queries/shared";
import { registrosPorDiaYSource } from "@/lib/queries/diarias";
import {
  pacientesNuevosPorDiaYSource,
  conversionPorDiaYSource,
} from "@/lib/queries/por-source";

/**
 * El grano de tráfico por campaña: una fila por día, país y `utm_source`.
 *
 * Existe aparte del sync diario por una sola razón. El sync nocturno escribe
 * una ventana de 45 días, así que `marketing.metricas_utm` nunca tuvo nada
 * anterior a 45 días antes de su primera corrida —el 3 de agosto de 2026— y
 * nunca lo iba a tener. El gasto, en cambio, sale de `marketing.gastos_diarios`
 * y llega hasta diciembre de 2025.
 *
 * Con las dos tablas de largos distintos, cualquier rango de Ads más largo que
 * lo que cubre el tráfico dividía todo el gasto por una fracción de los
 * pacientes: 90 días en AR daban un CAC de US$ 18,5 cuando los días que tenían
 * las dos cosas daban US$ 13,0. El número no estaba mal calculado, estaba
 * calculado sobre dos ventanas distintas.
 *
 * El armado de las filas es la MISMA función que usa el sync diario, no una
 * copia: si fueran dos, un día viejo y uno nuevo podrían contar cosas
 * distintas y no habría forma de notarlo mirando la pantalla.
 */

export type FilaUtm = {
  fecha: string;
  pais: string;
  utm_source: string;
  registros: number | null;
  nuevos: number | null;
  convertidos: number | null;
};

type PorDiaSource = { dia: string; utm_source: string; n: number };
type ConvPorDiaSource = {
  dia: string;
  utm_source: string;
  registros: number;
  convertidos: number;
};

/**
 * Las tres mediciones por día y campaña, cruzadas en una fila por par.
 *
 * Pura y sin base de datos a propósito: el sync diario ya trae las tres
 * consultas para otra cosa y le pasa lo que tiene, y el backfill las trae él
 * mismo. Ninguno de los dos paga la consulta del otro.
 *
 * `conversionPorDiaYSource` pisa `registros` en vez de sumarlo: las dos
 * consultas cuentan el mismo registro —una agrupa por día de creación y la
 * otra también— así que sumarlas contaría cada registro dos veces. Es el orden
 * que ya tenía el sync diario y se conserva tal cual.
 */
export function armarFilasUtm(
  pais: string,
  porSource: PorDiaSource[],
  nuevosSource: PorDiaSource[],
  convSource: ConvPorDiaSource[],
): FilaUtm[] {
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

  const filas: FilaUtm[] = [];
  for (const [clave, v] of crudo) {
    const [fecha, source] = clave.split("|");
    filas.push({
      fecha: fecha!,
      pais,
      utm_source: source!,
      registros: v.registros,
      nuevos: v.nuevos,
      convertidos: v.convertidos,
    });
  }
  return filas;
}

/**
 * Escribe las filas en bloque, no de a una.
 *
 * Un backfill de un mes son varios miles de filas y de a una serían varios
 * miles de ida y vuelta contra el techo de 60 segundos. Upsert sobre la clave
 * primaria, así que correrlo dos veces sobre el mismo rango deja lo mismo.
 */
export async function guardarFilasUtm(
  db: Client,
  filas: FilaUtm[],
): Promise<number> {
  if (filas.length === 0) return 0;

  await db.query(
    `insert into marketing.metricas_utm
       (fecha, pais, utm_source, registros, pacientes_nuevos, convertidos)
     select * from unnest($1::date[], $2::text[], $3::text[], $4::int[],
                          $5::int[], $6::int[])
     on conflict (fecha, pais, utm_source) do update set
       registros = excluded.registros,
       pacientes_nuevos = excluded.pacientes_nuevos,
       convertidos = excluded.convertidos,
       actualizado_en = now()`,
    [
      filas.map((f) => f.fecha),
      filas.map((f) => f.pais),
      filas.map((f) => f.utm_source),
      filas.map((f) => f.registros),
      filas.map((f) => f.nuevos),
      filas.map((f) => f.convertidos),
    ],
  );
  return filas.length;
}

/**
 * Rellena el tráfico por campaña de un rango explícito de fechas.
 *
 * No depende de "hoy": el rango se pide, no se deriva. Escribe únicamente
 * `marketing.metricas_utm` y ninguna otra tabla — ni el grano diario ni las
 * sesiones vendidas— porque lo único que quedó corto es esto.
 */
export async function rellenarUtm(
  mysql: Connection,
  db: Client,
  rango: Rango,
): Promise<number> {
  let escritas = 0;

  for (const pais of PAISES as readonly Pais[]) {
    const [porSource, nuevosSource, convSource] = await Promise.all([
      registrosPorDiaYSource(mysql, rango, pais),
      pacientesNuevosPorDiaYSource(mysql, rango, pais),
      conversionPorDiaYSource(mysql, rango, pais),
    ]);

    escritas += await guardarFilasUtm(
      db,
      armarFilasUtm(pais, porSource, nuevosSource, convSource),
    );
  }

  return escritas;
}

/**
 * Un rango de días locales (UTC−3) a partir de dos fechas de calendario,
 * `hasta` incluido.
 *
 * Las consultas de MySQL comparan contra `creacion`, que es un timestamp, así
 * que el fin tiene que ser el día siguiente a la medianoche y no el mismo día
 * — con `<= hasta` se perdería todo lo que pasó después de las 00:00 del
 * último día.
 */
export function rangoEntre(desde: string, hasta: string): Rango {
  // Medianoche local es LOCAL_UTC_OFFSET_HOURS después de la medianoche UTC,
  // igual que en `ultimosDias`. Sale de la constante y no de un 3 escrito a
  // mano: si el offset cambiara, un literal acá movería medio día de datos sin
  // que nada fallara.
  const enPunto = (dia: string) =>
    new Date(
      Date.parse(`${dia}T00:00:00Z`) + LOCAL_UTC_OFFSET_HOURS * 3_600_000,
    )
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

  const finExclusivo = new Date(Date.parse(`${hasta}T00:00:00Z`) + 86_400_000)
    .toISOString()
    .slice(0, 10);

  return { start: enPunto(desde), end: enPunto(finExclusivo) };
}
