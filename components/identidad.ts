/**
 * Identity colour per country, and a colour per metric.
 *
 * The country colour marks which country is on screen and never recolours a
 * series. The metric colour travels with the metric, from the border of its
 * card to the bars or the line of its chart, so a glance says which series is
 * on screen without reading the label.
 */
export const IDENTIDAD: Record<string, { punto: string; nombre: string }> = {
  TOTAL: { punto: "bg-orange", nombre: "Total" },
  AR: { punto: "bg-teal", nombre: "Argentina" },
  UY: { punto: "bg-gold", nombre: "Uruguay" },
};

export function identidadDe(pais: string) {
  return IDENTIDAD[pais] ?? IDENTIDAD.TOTAL!;
}

export type ColorMetrica = {
  relleno: string;
  trazo: string;
  borde: string;
  fondo: string;
};

/**
 * Written out rather than built from a template: Tailwind scans the source for
 * class names, and a name assembled at runtime never reaches the stylesheet.
 */
export const COLORES: Record<string, ColorMetrica> = {
  registros: {
    relleno: "fill-orange", trazo: "stroke-orange",
    borde: "border-orange", fondo: "bg-orange",
  },
  nuevos: {
    relleno: "fill-orange-dk", trazo: "stroke-orange-dk",
    borde: "border-orange-dk", fondo: "bg-orange-dk",
  },
  activos: {
    relleno: "fill-teal", trazo: "stroke-teal",
    borde: "border-teal", fondo: "bg-teal",
  },
  conversion: {
    relleno: "fill-gold", trazo: "stroke-gold",
    borde: "border-gold", fondo: "bg-gold",
  },
  cac: {
    relleno: "fill-teal", trazo: "stroke-teal",
    borde: "border-teal", fondo: "bg-teal",
  },
  costo_registro: {
    relleno: "fill-coral", trazo: "stroke-coral",
    borde: "border-coral", fondo: "bg-coral",
  },
  ltv: {
    relleno: "fill-gold", trazo: "stroke-gold",
    borde: "border-gold", fondo: "bg-gold",
  },
};

export function colorDe(id: string): ColorMetrica {
  return COLORES[id] ?? COLORES.registros!;
}

/**
 * Platform colours for the stacked daily chart. Enough hues to tell five or
 * six platforms apart, all from the palette, with the brand orange going to
 * the largest one.
 */
const PLATAFORMA_COLORES = [
  "bg-orange",
  "bg-teal",
  "bg-gold",
  "bg-coral",
  "bg-orange-lt",
  "bg-orange-dk",
];

export function colorPlataforma(indice: number): string {
  return PLATAFORMA_COLORES[indice % PLATAFORMA_COLORES.length]!;
}
