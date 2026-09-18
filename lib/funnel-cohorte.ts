import { withDb } from "@/lib/db";
import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";
import {
  ETIQUETA_ETAPA,
  ETIQUETA_TRAMO,
  ULTIMA_ETAPA,
  madurez,
} from "@/lib/funnel";

/**
 * El embudo por cohorte: un mes de compradores, seguido hacia adelante.
 *
 * Es la otra mitad de `lib/funnel.ts`, no un reemplazo. Aquel mira una ventana
 * móvil de 90, 180 o 365 días y tiene que cortar cada etapa en su propia
 * madurez, porque adentro de la ventana conviven el que compró ayer y el que
 * compró hace un año. Acá no: todos compraron el mismo mes, así que la cohorte
 * entera tiene una sola edad y los porcentajes se leen contra un único
 * denominador —los compradores del mes— sin más aclaraciones.
 *
 * Por eso no hay rango libre de fechas. Un rango arbitrario mezcla gente con
 * distinta madurez y produce una caída que es en parte el calendario.
 *
 * La edad de la cohorte se mide desde el ÚLTIMO comprador del mes, no desde el
 * primero ni desde el fin del mes calendario: es el más joven el que decide si
 * la cohorte ya puede responder una pregunta.
 */

/** Cuántos meses muestra la grilla. */
export const PROFUNDIDADES = [6, 12, 24] as const;
export type Profundidad = (typeof PROFUNDIDADES)[number];

/** Cuántos meses ofrece el desplegable del embudo. */
const MESES_EN_SELECTOR = 12;

export type EtapaCohorte = {
  nro: number;
  etiqueta: string;
  /** Null cuando la cohorte todavía no tiene edad para esta etapa. */
  llegaron: number | null;
  /** Sobre los compradores de la cohorte. */
  pctDelTotal: number | null;
  /** Días que le faltan a la cohorte para poder responder por esta etapa. */
  faltanDias: number | null;
};

export type TramoCohorte = {
  tramo: number;
  etiqueta: string;
  /** Gente que llegó a la etapa de origen y no pasó a la siguiente. */
  perdidos: number | null;
  /** Sobre los que habían llegado a la etapa de origen. */
  pctCaida: number | null;
  faltanDias: number | null;
};

export type Cohorte = {
  mes: string;
  /** Compradores del mes. */
  n: number;
  /** Edad de la cohorte en días, contada desde el comprador más nuevo. */
  diasMadurez: number;
  etapas: EtapaCohorte[];
  tramos: TramoCohorte[];
};

export type VistaCohortes = {
  /** La cohorte que dibuja el embudo. */
  elegida: Cohorte | null;
  /** Los meses del desplegable, del más nuevo al más viejo. */
  meses: string[];
  /** Las filas de la grilla, del más nuevo al más viejo. */
  grilla: Cohorte[];
  profundidad: Profundidad;
};

export async function leerCohortes(
  pais: string,
  profundidad: Profundidad,
  mesPedido?: string,
  ahora = new Date(),
): Promise<VistaCohortes> {
  const paises = pais === "TOTAL" ? ["AR", "UY"] : [pais];
  const hoy = diaLocal(ahora);
  // Se piden siempre los meses de la grilla más larga posible o los del
  // selector, lo que sea mayor: el embudo tiene que poder dibujar un mes que
  // la grilla corta no muestra.
  const meses = Math.max(profundidad, MESES_EN_SELECTOR);

  const cohortes = await withDb(async (db) => {
    const { rows } = await db.query<{
      mes: string;
      nro_sesion: number;
      pacientes: string;
      ultimo: string;
    }>(
      `select mes, nro_sesion, pacientes::text, ultimo::text from (
         select to_char(date_trunc('month', fecha_compra), 'YYYY-MM') as mes,
                nro_sesion,
                sum(pacientes) as pacientes,
                max(max(fecha_compra)) over (
                  partition by date_trunc('month', fecha_compra)
                ) as ultimo
           from marketing.funnel_etapas
          where pais = any($1)
            and nro_sesion <= $2
            and fecha_compra >= (date_trunc('month', $3::date)
                                 - make_interval(months => $4))
          group by date_trunc('month', fecha_compra), nro_sesion
       ) t
       order by mes desc, nro_sesion`,
      [paises, ULTIMA_ETAPA, hoy, meses - 1],
    );
    return rows;
  });

  const armadas = armar(cohortes, hoy);
  const listaMeses = armadas.slice(0, MESES_EN_SELECTOR).map((c) => c.mes);

  return {
    elegida:
      armadas.find((c) => c.mes === mesPedido) ?? porDefecto(armadas) ?? null,
    meses: listaMeses,
    grilla: armadas.slice(0, profundidad),
    profundidad,
  };
}

/**
 * La cohorte que se muestra sin que nadie elija: la más nueva que ya puede
 * responder por las siete etapas.
 *
 * Abrir la pantalla en el mes en curso mostraría un embudo casi entero vacío.
 * Si ninguna llegó a la madurez completa —una base recién estrenada— se cae a
 * la más vieja que haya, que es la que más preguntas contesta.
 */
function porDefecto(cohortes: Cohorte[]): Cohorte | undefined {
  return (
    cohortes.find((c) => c.diasMadurez >= madurez(ULTIMA_ETAPA)) ??
    cohortes.at(-1)
  );
}

function armar(
  filas: { mes: string; nro_sesion: number; pacientes: string; ultimo: string }[],
  hoy: string,
): Cohorte[] {
  const porMes = new Map<string, { ultimo: string; etapas: Map<number, number> }>();

  for (const f of filas) {
    const entrada = porMes.get(f.mes) ?? {
      ultimo: f.ultimo.slice(0, 10),
      etapas: new Map<number, number>(),
    };
    entrada.etapas.set(Number(f.nro_sesion), Number(f.pacientes));
    porMes.set(f.mes, entrada);
  }

  return [...porMes.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mes, { ultimo, etapas }]) => {
      const n = etapas.get(0) ?? 0;
      const diasMadurez = diasEntre(ultimo, hoy);

      const filasEtapa: EtapaCohorte[] = ETIQUETA_ETAPA.map((etiqueta, nro) => {
        const falta = madurez(nro) - diasMadurez;
        const maduro = falta <= 0;
        const llegaron = etapas.get(nro) ?? 0;
        return {
          nro,
          etiqueta,
          llegaron: maduro ? llegaron : null,
          pctDelTotal: maduro && n > 0 ? llegaron / n : null,
          faltanDias: maduro ? null : falta,
        };
      });

      const filasTramo: TramoCohorte[] = ETIQUETA_TRAMO.map((etiqueta, tramo) => {
        const origen = filasEtapa[tramo]!;
        const destino = filasEtapa[tramo + 1]!;
        // El tramo madura con su ETAPA DE DESTINO: saber cuántos no pasaron a
        // la siguiente exige que la siguiente ya haya tenido tiempo de pasar.
        if (origen.llegaron === null || destino.llegaron === null) {
          return {
            tramo,
            etiqueta,
            perdidos: null,
            pctCaida: null,
            faltanDias: destino.faltanDias,
          };
        }
        const perdidos = Math.max(0, origen.llegaron - destino.llegaron);
        return {
          tramo,
          etiqueta,
          perdidos,
          pctCaida: origen.llegaron > 0 ? perdidos / origen.llegaron : null,
          faltanDias: null,
        };
      });

      return { mes, n, diasMadurez, etapas: filasEtapa, tramos: filasTramo };
    });
}

/** Hoy como día calendario local (UTC−3), que es como se corta todo acá. */
function diaLocal(ahora: Date): string {
  return new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
      86_400_000,
  );
}
