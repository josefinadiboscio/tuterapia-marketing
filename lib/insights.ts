import { withDb } from "@/lib/db";
import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";

/**
 * Los insights publicados.
 *
 * Esta pantalla no analiza nada: lee `marketing.insights` y la dibuja. El
 * análisis corre una vez por día, aparte, después de la sincronización.
 *
 * La separación es el punto. Si el generador no corre, el dashboard sigue
 * mostrando los insights de ayer con su fecha a la vista, en vez de quedarse
 * en blanco o —peor— fabricar algo en el momento para tener contenido.
 */

/** Tope duro. Un análisis puede encontrar quince cosas ciertas y triviales. */
export const MAXIMO = 6;

/** Como mucho dos en "Lo más importante hoy". */
export const MAXIMO_DESTACADOS = 2;

export const DOMINIOS = ["cruce", "general", "ads", "funnel"] as const;
export type Dominio = (typeof DOMINIOS)[number];

export type Severidad = "alerta" | "oportunidad" | "observacion";

export type Dato = {
  etiqueta: string;
  antes: string | null;
  ahora: string;
  /** De qué tabla de agregados salió. Sin esto el insight no se publica. */
  fuente: string;
};

export type Enlace = { href: string; texto: string };

export type Insight = {
  id: number;
  fecha: string;
  dominio: Dominio;
  severidad: Severidad;
  destacado: boolean;
  titular: string;
  cuerpo: string;
  recomendacion: string | null;
  datos: Dato[];
  enlaces: Enlace[];
  /** Si vuelve porque empeoró, la vez anterior. */
  agravadoDe: number | null;
};

export type VistaInsights = {
  /** El día del análisis que se está mostrando. */
  fecha: string | null;
  /** Cuántos días hace que se generó. 0 es hoy. */
  antiguedadDias: number | null;
  destacados: Insight[];
  /** Los demás, agrupados y en el orden de DOMINIOS. */
  porDominio: { dominio: Dominio; insights: Insight[] }[];
  /** Total publicado hoy, destacados incluidos. */
  total: number;
};

export async function leerInsights(
  pais: string,
  ahora = new Date(),
): Promise<VistaInsights> {
  const filas = await withDb(async (db) => {
    // La última fecha CON insights activos de este país, y sus filas.
    // Dos pasos en una query: sin esto, un día sin novedades devolvería
    // vacío en vez de lo último que sí se publicó.
    const { rows } = await db.query<{
      id: number;
      fecha: string;
      dominio: Dominio;
      severidad: Severidad;
      destacado: boolean;
      titular: string;
      cuerpo: string;
      recomendacion: string | null;
      datos: Dato[];
      enlaces: Enlace[];
      agravado_de: number | null;
    }>(
      `select id, fecha::text, dominio, severidad, destacado,
              titular, cuerpo, recomendacion, datos, enlaces, agravado_de
         from marketing.insights
        where pais = $1
          and estado = 'activo'
          and fecha = (
            select max(fecha) from marketing.insights
             where pais = $1 and estado = 'activo'
          )
        order by destacado desc, severidad, id`,
      [pais],
    );
    return rows;
  });

  if (filas.length === 0) {
    return {
      fecha: null,
      antiguedadDias: null,
      destacados: [],
      porDominio: [],
      total: 0,
    };
  }

  const normalizar = (f: (typeof filas)[number]): Insight => ({
    id: f.id,
    fecha: f.fecha,
    dominio: f.dominio,
    severidad: f.severidad,
    destacado: f.destacado,
    titular: f.titular,
    cuerpo: f.cuerpo,
    recomendacion: f.recomendacion,
    datos: f.datos ?? [],
    enlaces: f.enlaces ?? [],
    agravadoDe: f.agravado_de,
  });

  const todos = filas.map(normalizar).slice(0, MAXIMO);
  const destacados = todos
    .filter((i) => i.destacado)
    .slice(0, MAXIMO_DESTACADOS);
  const resto = todos.filter((i) => !destacados.includes(i));

  const fecha = filas[0]!.fecha;

  return {
    fecha,
    antiguedadDias: diasEntre(fecha, diaLocal(ahora)),
    destacados,
    porDominio: DOMINIOS.map((dominio) => ({
      dominio,
      insights: resto.filter((i) => i.dominio === dominio),
    })).filter((g) => g.insights.length > 0),
    total: todos.length,
  };
}

/**
 * Lo que hay que mirar aunque no haya insights: valores que se están quedando
 * viejos y nadie avisa.
 *
 * El tipo de cambio es el caso serio. Se carga a mano y el margen y el LTV en
 * dólares salen de él, así que cuando envejece los números no se rompen: se
 * desvían de a poco y siguen pareciendo correctos. Este bloque existe para que
 * esa desviación tenga dónde verse.
 */
export type TipoDeCambio = {
  pais: string;
  valor: string;
  desde: string;
  diasSinTocar: number;
};

export type Pendientes = {
  tipoDeCambio: TipoDeCambio[];
  /** Meses cerrados que ningún tipo de cambio alcanza a cubrir. */
  mesesSinCambio: { mes: string; pais: string }[];
  /** utm_source con volumen real que no cae en ningún patrón. */
  sinMapear: { utm_source: string; pais: string; registros: number }[];
};

export async function leerPendientes(ahora = new Date()): Promise<Pendientes> {
  const hoy = diaLocal(ahora);
  return withDb(async (db) => {
    const [vigentes, faltantes, sinMapear] = await Promise.all([
      db.query<{
        pais: string;
        valor: string;
        vigente_desde: string;
        cargado_en: string;
      }>(
        `select distinct on (pais)
                pais, valor::text, vigente_desde::text, cargado_en::date::text
           from marketing.parametros
          where clave = 'tipo_cambio'
          order by pais, vigente_desde desc`,
      ),
      // Un mes cerrado no se puede costear sin un tipo de cambio que lo
      // alcance. Venía de la pantalla de Admin, que ya no existe.
      db.query<{ mes: string; pais: string }>(
        `select to_char(m.mes, 'YYYY-MM') as mes, p.pais
           from (select distinct mes from marketing.metricas_mensuales
                  where es_provisorio = false) m
           cross join (values ('AR'), ('UY')) as p(pais)
          where not exists (
            select 1 from marketing.parametros par
             where par.clave = 'tipo_cambio' and par.pais = p.pais
               and par.vigente_desde <= (m.mes + interval '1 month' - interval '1 day')
          )
          order by m.mes desc, p.pais
          limit 12`,
      ),
      db.query<{ utm_source: string; pais: string; registros: number }>(
        `select utm_source, pais, sum(registros)::int as registros
           from marketing.utm_sin_mapear
          where mes >= (current_date - interval '6 months')
          group by utm_source, pais
         having sum(registros) >= 20
          order by registros desc limit 8`,
      ),
    ]);

    return {
      tipoDeCambio: vigentes.rows.map((r) => ({
        pais: r.pais,
        valor: r.valor,
        desde: r.vigente_desde,
        diasSinTocar: diasEntre(r.cargado_en, hoy) ?? 0,
      })),
      mesesSinCambio: faltantes.rows,
      sinMapear: sinMapear.rows,
    };
  });
}

/** Hoy como día calendario local (UTC−3), como todo en este dashboard. */
function diaLocal(ahora: Date): string {
  return new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number | null {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}
