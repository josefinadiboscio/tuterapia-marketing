/**
 * Cómo se pinta y se nombra cada segmento del apilado.
 *
 * Vive fuera de `lib/sesiones.ts` porque ese módulo importa `pg`: una sola
 * importación desde un componente de cliente se llevaría el driver de Postgres
 * al bundle del browser.
 *
 * **Las dos variantes están escritas enteras, a propósito.** Tailwind lee el
 * fuente como texto: una clase que solo existe porque alguien la armó en
 * runtime —con un template literal o con `.replace("fill-", "bg-")`— nunca
 * llega a la hoja de estilo. Con solo la tabla de `fill-` las barras del SVG
 * se pintaban y los cuadraditos de la leyenda salían vacíos, que es
 * exactamente lo que pasó.
 *
 * Es el mismo patrón que `identidad.ts`, que guarda `relleno`, `trazo`,
 * `borde` y `fondo` de cada color por el mismo motivo.
 */
export const RELLENO_SEGMENTO: Record<string, string> = {
  "AR·online": "fill-ses-ar-on",
  "AR·presencial": "fill-ses-ar-pre",
  "AR·sin_dato": "fill-ses-nd",
  "UY·online": "fill-ses-uy-on",
  "UY·presencial": "fill-ses-uy-pre",
  "UY·sin_dato": "fill-ses-nd",
};

export const FONDO_SEGMENTO: Record<string, string> = {
  "AR·online": "bg-ses-ar-on",
  "AR·presencial": "bg-ses-ar-pre",
  "AR·sin_dato": "bg-ses-nd",
  "UY·online": "bg-ses-uy-on",
  "UY·presencial": "bg-ses-uy-pre",
  "UY·sin_dato": "bg-ses-nd",
};

export function ETIQUETA_SEGMENTO(clave: string): string {
  const [pais, modalidad] = clave.split("·");
  const nombre = modalidad === "sin_dato" ? "sin dato" : (modalidad ?? "");
  return `${pais} ${nombre}`;
}
