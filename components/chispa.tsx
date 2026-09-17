import { tonoDeRoas, type Tono } from "@/lib/umbrales";

/**
 * Six weeks of sales, one bar each, oldest on the left.
 *
 * The height says how many patients that week brought; the colour says whether
 * they paid for themselves. A week with sales that lost money and a week with
 * sales that made money look the same on a line, which is exactly the thing
 * worth seeing, so the shape and the verdict are drawn together.
 *
 * A week with no spend has no ratio at all and is left grey — that is not the
 * same as a week that lost money.
 */

const RELLENO: Record<Tono, string> = {
  verde: "fill-green",
  oro: "fill-gold",
  coral: "fill-coral",
  nulo: "fill-borde",
};

const DICE: Record<Tono, string> = {
  verde: "devolvió más de 1,30 por dólar",
  oro: "devolvió entre 1,00 y 1,30",
  coral: "devolvió menos de lo que costó",
  nulo: "sin gasto esa semana",
};

export function Chispa({
  valores,
  roas = [],
}: {
  /** Sales per week, oldest first. */
  valores: number[];
  /** That week's return per dollar; NaN or missing where nothing was spent. */
  roas?: number[];
}) {
  const alto = 18;
  const ancho = 58;

  if (valores.length === 0) {
    return (
      <svg width={ancho} height={alto} className="inline-block align-middle">
        <line
          x1="0"
          y1={alto - 1}
          x2={ancho}
          y2={alto - 1}
          className="stroke-borde"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const max = Math.max(...valores, 1);
  const paso = ancho / valores.length;
  const grosor = Math.max(3, paso - 2);

  return (
    <svg
      width={ancho}
      height={alto}
      className="inline-block align-middle"
      role="img"
    >
      {valores.map((v, i) => {
        const tono = tonoDeRoas(roas[i]);
        // A week with no sales still gets a sliver, so an empty week reads as
        // empty rather than as a week that is not there.
        const h = v === 0 ? 1 : Math.max(2, (v / max) * (alto - 1));
        return (
          <rect
            key={i}
            x={i * paso + (paso - grosor) / 2}
            y={alto - h}
            width={grosor}
            height={h}
            rx={1}
            className={v === 0 ? "fill-borde" : RELLENO[tono]}
          >
            <title>{`${v} ${v === 1 ? "venta" : "ventas"} · ${DICE[tono]}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}
