/**
 * Identity colour per country, and a colour per metric.
 *
 * The country colour marks which country is on screen — a dot beside the
 * active selector and a mark on the chart — and never recolours a series.
 *
 * The metric colour does the opposite job: it travels with the metric, from
 * the border of its card to the bars or the line of its chart, so a glance
 * says which series is on screen without reading the label.
 */
export const IDENTIDAD: Record<string, { punto: string; nombre: string }> = {
  TOTAL: { punto: "bg-navy", nombre: "Total" },
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

export const COLORES: Record<string, ColorMetrica> = {
  registros: { relleno: "fill-sage", trazo: "stroke-sage", borde: "border-sage", fondo: "bg-sage" },
  nuevos: { relleno: "fill-forest", trazo: "stroke-forest", borde: "border-forest", fondo: "bg-forest" },
  activos: { relleno: "fill-teal", trazo: "stroke-teal", borde: "border-teal", fondo: "bg-teal" },
  conversion: { relleno: "fill-gold", trazo: "stroke-gold", borde: "border-gold", fondo: "bg-gold" },
  cac: { relleno: "fill-teal-deep", trazo: "stroke-teal-deep", borde: "border-teal-deep", fondo: "bg-teal-deep" },
  costo_registro: { relleno: "fill-coral", trazo: "stroke-coral", borde: "border-coral", fondo: "bg-coral" },
  ltv: { relleno: "fill-gold", trazo: "stroke-gold", borde: "border-gold", fondo: "bg-gold" },
};

export function colorDe(id: string): ColorMetrica {
  return COLORES[id] ?? COLORES.registros!;
}
