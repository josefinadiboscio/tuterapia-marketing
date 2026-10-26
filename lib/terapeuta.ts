import type { MesSerie } from "@/lib/dashboard";

/**
 * Eligieron terapeuta: el paso del embudo que faltaba.
 *
 * La pestaña Funnel arranca en la compra, así que entre "se registró" y
 * "compró" no había nada en pantalla. Y ahí está el corte más grande que tiene
 * el negocio: de los registros de julio en adelante, los que NO tienen
 * terapeuta compraron 1 vez sobre 8.355; los que sí, 2.725 sobre 19.460.
 * Elegir terapeuta no es un dato de perfil, es la puerta de entrada.
 *
 * El número sale de `marketing.metricas_mensuales.eligieron_terapeuta`, la
 * misma fila y la misma tabla de la que General saca los registros, así que el
 * total de la barra apilada es exactamente el registro que muestra la card de
 * arriba. No hay dos lugares donde pueda dar distinto.
 */

/**
 * Cuántos días necesita una cohorte para terminar de elegir.
 *
 * Medido, no supuesto. `pacientes.id_terapeuta` no tiene fecha propia, así que
 * la única forma de ver cuánto tarda la elección es comparar cohortes de
 * distinta edad:
 *
 *   · a cuatro días de registrarse, un día de registros va en 15–22%;
 *   · a tres semanas, en 42–48%;
 *   · a 23–25 días, en 67–78%;
 *   · y los meses ya cerrados quedan planos en 73–82%, sin subir más con la
 *     edad: marzo de 2026 (siete meses) marca 75,6% y septiembre (uno) 76,7%.
 *
 * Son 25 y no 30 porque la curva ya está plana a los 23: con 30 el mes
 * anterior quedaría marcado como sin terminar durante todo el mes siguiente, y
 * marcar de sin terminar un número que ya no se mueve es tan engañoso como no
 * marcar el que sí.
 */
export const DIAS_PARA_ELEGIR = 25;

export type MesTerapeuta = {
  mes: string;
  /** Registros del mes. El total de la barra. */
  registros: number;
  eligieron: number;
  /** Registros menos los que eligieron. */
  sinTerapeuta: number;
  /** Sobre los registros del mes. Null sin registros: no hay sobre qué. */
  parte: number | null;
  /**
   * Días que tiene el registro MÁS NUEVO de la cohorte.
   *
   * No la edad desde el primero del mes, que es lo que guarda
   * `cohorte_edad_dias`: lo que decide si la cohorte terminó de elegir es su
   * miembro más joven, igual que la madurez del funnel se mide desde el último
   * comprador. Un mes que cerró ayer tiene registros de un día.
   */
  edadDias: number;
  /** `edadDias >= DIAS_PARA_ELEGIR`: recién ahí se compara contra otro mes. */
  madura: boolean;
};

export type VistaTerapeuta = {
  meses: MesTerapeuta[];
  /** El último mes maduro, que es el único que se puede leer como final. */
  ultimaMadura: MesTerapeuta | null;
  /** La anterior a esa, para el movimiento. */
  previaMadura: MesTerapeuta | null;
  /** Los meses que todavía están eligiendo, para nombrarlos en el pie. */
  inmaduras: MesTerapeuta[];
};

/**
 * Arma la vista desde la serie que General ya leyó.
 *
 * No consulta nada: `leerGeneral` trae `registros` y `eligieron_terapeuta` en
 * la misma fila, y pedirlos de nuevo abriría la puerta a que las dos lecturas
 * caigan en distintos momentos y la barra no cierre con su propia card.
 *
 * Un mes sin `eligieron_terapeuta` —cualquier mes anterior a esta migración,
 * porque el cron solo reescribe el mes en curso y el anterior— se saltea
 * entero. Dibujar un cero sería decir que nadie eligió terapeuta en marzo.
 */
export function armarTerapeuta(
  serie: MesSerie[],
  ahora = new Date(),
): VistaTerapeuta {
  const meses: MesTerapeuta[] = [];

  for (const m of serie) {
    if (m.eligieron_terapeuta === null || m.registros === null) continue;

    const registros = m.registros;
    const eligieron = m.eligieron_terapeuta;
    const edadDias = diasDesdeFinDeMes(m.mes, ahora);

    meses.push({
      mes: m.mes,
      registros,
      eligieron,
      // Nunca negativo: el numerador y el denominador salen de dos consultas
      // sobre la misma ventana, pero si alguna vez no cerraran, un segmento
      // negativo dibujaría una barra hacia arriba del eje y nadie lo leería
      // como un error.
      sinTerapeuta: Math.max(0, registros - eligieron),
      parte: registros > 0 ? eligieron / registros : null,
      edadDias,
      madura: edadDias >= DIAS_PARA_ELEGIR,
    });
  }

  const maduras = meses.filter((m) => m.madura);

  return {
    meses,
    ultimaMadura: maduras[maduras.length - 1] ?? null,
    previaMadura: maduras[maduras.length - 2] ?? null,
    inmaduras: meses.filter((m) => !m.madura),
  };
}

/**
 * Días desde que terminó el mes, en día local (UTC−3).
 *
 * Es la edad del registro más nuevo de la cohorte. Para el mes en curso da 0:
 * todavía está entrando gente.
 */
function diasDesdeFinDeMes(mes: string, ahora: Date): number {
  const [year, month] = mes.split("-").map(Number);
  // Medianoche local del primer día del mes SIGUIENTE, que es cuando la
  // cohorte dejó de recibir registros.
  const fin = Date.UTC(year!, month!, 1, 3);
  return Math.max(0, Math.floor((ahora.getTime() - fin) / 86_400_000));
}
