import { withDb } from "@/lib/db";
import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";

/**
 * El análisis semanal publicado.
 *
 * Esta pantalla no analiza nada: lee `marketing.insights` y la dibuja. El
 * análisis corre los lunes a la mañana, aparte, después de la sincronización,
 * y habla de la semana cerrada anterior.
 *
 * La separación es el punto. Si el generador no corre, el dashboard sigue
 * mostrando el análisis de la última semana que sí tuvo, con su período a la
 * vista, en vez de quedarse en blanco o fabricar algo en el momento para tener
 * contenido.
 *
 * Semanal y no diario porque una pestaña que pide atención todos los días la
 * gasta. Un tema por semana se lee; seis tarjetas por día se ignoran.
 */

/** Un tema principal y, como mucho, tres notas. */
export const MAXIMO_NOTAS = 3;

/** Cuántas semanas anteriores lista el archivo. */
const SEMANAS_DE_ARCHIVO = 12;

export const DOMINIOS = ["cruce", "general", "ads", "funnel"] as const;
export type Dominio = (typeof DOMINIOS)[number];

/**
 * Tamaño de oportunidad, no nivel de alarma.
 *
 * `alta` es donde hay más para ganar y va en naranja. `normal` es el resto.
 * No hay un tercer estado ni un color de alerta: una pestaña que abre con tres
 * cosas en rojo enseña a no abrirla, y lo que se busca acá es que se abra.
 */
export type Severidad = "alta" | "normal";

/** Qué lugar ocupa en el análisis de la semana. */
export type Rol = "tema" | "nota";

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
  semana: string;
  dominio: Dominio;
  severidad: Severidad;
  rol: Rol;
  titular: string;
  cuerpo: string;
  recomendacion: string | null;
  datos: Dato[];
  enlaces: Enlace[];
  /** Si vuelve porque la oportunidad creció, la vez anterior. */
  agravadoDe: number | null;
};

export type Analisis = {
  /** Lunes de la semana analizada. */
  semana: string;
  /** El domingo que la cierra. */
  hasta: string;
  tema: Insight | null;
  notas: Insight[];
  /**
   * Cuántas semanas atrás quedó respecto de la última semana cerrada. 0 es la
   * que corresponde; 2 quiere decir que hace dos semanas que no se publica.
   */
  semanasAtras: number;
};

export type EnArchivo = {
  semana: string;
  hasta: string;
  titular: string;
  piezas: number;
};

export type VistaInsights = {
  /** El análisis que se está mostrando. */
  analisis: Analisis | null;
  /** La semana cerrada que corresponde hoy, haya análisis o no. */
  semanaCorriente: string;
  /** Las anteriores, de la más nueva a la más vieja, sin la mostrada. */
  archivo: EnArchivo[];
};

/**
 * El análisis de una semana, o el más reciente que haya.
 *
 * `semanaPedida` viene del archivo. Sin ella se muestra el último publicado,
 * que no siempre es el de la semana que corresponde — y por eso `semanasAtras`
 * lo dice en vez de dejar que un análisis viejo pase por nuevo.
 */
export async function leerInsights(
  pais: string,
  semanaPedida?: string,
  ahora = new Date(),
): Promise<VistaInsights> {
  const semanaCorriente = semanaCerrada(diaLocal(ahora));

  const { filas, archivo } = await withDb(async (db) => {
    const [piezas, semanas] = await Promise.all([
      db.query<{
        id: number;
        semana: string;
        dominio: Dominio;
        severidad: Severidad;
        rol: Rol;
        titular: string;
        cuerpo: string;
        recomendacion: string | null;
        datos: Dato[];
        enlaces: Enlace[];
        agravado_de: number | null;
      }>(
        `select id, semana::text, dominio, severidad, rol,
                titular, cuerpo, recomendacion, datos, enlaces, agravado_de
           from marketing.insights
          where pais = $1
            and estado = 'activo'
            and semana = coalesce(
              $2::date,
              (select max(semana) from marketing.insights
                where pais = $1 and estado = 'activo')
            )
          order by (rol = 'tema') desc, severidad, id`,
        [pais, semanaPedida ?? null],
      ),
      // El archivo lista una entrada por semana, con el titular de su tema.
      // Sin el titular sería una lista de fechas, que no invita a abrir nada.
      db.query<{
        semana: string;
        titular: string | null;
        piezas: number;
      }>(
        `select semana::text,
                max(titular) filter (where rol = 'tema') as titular,
                count(*)::int as piezas
           from marketing.insights
          where pais = $1 and estado = 'activo'
          group by semana
          order by semana desc
          limit $2`,
        [pais, SEMANAS_DE_ARCHIVO],
      ),
    ]);
    return { filas: piezas.rows, archivo: semanas.rows };
  });

  const normalizar = (f: (typeof filas)[number]): Insight => ({
    id: f.id,
    semana: f.semana,
    dominio: f.dominio,
    severidad: f.severidad,
    rol: f.rol,
    titular: f.titular,
    cuerpo: f.cuerpo,
    recomendacion: f.recomendacion,
    datos: f.datos ?? [],
    enlaces: f.enlaces ?? [],
    agravadoDe: f.agravado_de,
  });

  const piezas = filas.map(normalizar);
  const semana = piezas[0]?.semana ?? null;

  const analisis: Analisis | null =
    semana === null
      ? null
      : {
          semana,
          hasta: sumarDias(semana, 6),
          tema: piezas.find((p) => p.rol === "tema") ?? null,
          notas: piezas
            .filter((p) => p.rol === "nota")
            .slice(0, MAXIMO_NOTAS),
          semanasAtras: Math.round(
            (Date.parse(`${semanaCorriente}T00:00:00Z`) -
              Date.parse(`${semana}T00:00:00Z`)) /
              (7 * 86_400_000),
          ),
        };

  return {
    analisis,
    semanaCorriente,
    archivo: archivo
      .filter((a) => a.semana !== semana)
      .map((a) => ({
        semana: a.semana,
        hasta: sumarDias(a.semana, 6),
        titular: a.titular ?? "Sin tema principal",
        piezas: a.piezas,
      })),
  };
}

/**
 * El lunes de la última semana CERRADA.
 *
 * El análisis del lunes habla de la semana que terminó ayer, no de la que
 * empieza hoy. Un lunes a la mañana la semana en curso tiene medio día de
 * datos, y medio día no es una semana.
 */
export function semanaCerrada(hoy: string): string {
  const dow = new Date(`${hoy}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const lunesDeEstaSemana = sumarDias(hoy, -(dow === 0 ? 6 : dow - 1));
  return sumarDias(lunesDeEstaSemana, -7);
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

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
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
