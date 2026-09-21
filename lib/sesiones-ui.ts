/**
 * Cómo se pinta y se nombra cada segmento del apilado.
 *
 * Vive fuera de `lib/sesiones.ts` porque ese módulo importa `pg`: una sola
 * importación desde un componente de cliente se llevaría el driver de Postgres
 * al bundle del browser.
 *
 * Las clases están escritas enteras, una por segmento, porque Tailwind lee el
 * fuente como texto: una clase armada con template literal nunca llega a la
 * hoja de estilo.
 */
export const RELLENO_SEGMENTO: Record<string, string> = {
  "AR·online": "fill-ses-ar-on",
  "AR·presencial": "fill-ses-ar-pre",
  "AR·sin_dato": "fill-ses-nd",
  "UY·online": "fill-ses-uy-on",
  "UY·presencial": "fill-ses-uy-pre",
  "UY·sin_dato": "fill-ses-nd",
};

export function ETIQUETA_SEGMENTO(clave: string): string {
  const [pais, modalidad] = clave.split("·");
  const nombre =
    modalidad === "sin_dato" ? "sin dato" : (modalidad ?? "");
  return `${pais} ${nombre}`;
}
