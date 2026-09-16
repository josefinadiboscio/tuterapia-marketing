/**
 * Identity colour per country.
 *
 * It marks which country is on screen — a dot beside the active selector and a
 * discreet mark on the charts — and nothing else. It never recolours a series:
 * green means volume and teal means economy, and letting the country repaint
 * them would collide with a meaning those colours already carry.
 */
export const IDENTIDAD: Record<string, { punto: string; nombre: string }> = {
  TOTAL: { punto: "bg-navy", nombre: "Total" },
  AR: { punto: "bg-teal", nombre: "Argentina" },
  UY: { punto: "bg-gold", nombre: "Uruguay" },
};

export function identidadDe(pais: string) {
  return IDENTIDAD[pais] ?? IDENTIDAD.TOTAL!;
}
