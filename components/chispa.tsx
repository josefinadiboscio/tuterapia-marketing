/**
 * The six-week ratio trend that sits beside the current ratio.
 *
 * It is drawn without axes or labels on purpose: the shape is the message, and
 * the number next to it is the value. With nothing to draw it renders a flat
 * dashed rule rather than a straight line, so an empty history never reads as
 * a stable one.
 */
export function Chispa({ valores }: { valores: number[] }) {
  const ancho = 58;
  const alto = 18;

  if (valores.length < 2) {
    return (
      <svg width={ancho} height={alto} className="inline-block align-middle">
        <line
          x1="0"
          y1={alto / 2}
          x2={ancho}
          y2={alto / 2}
          className="stroke-borde"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 1);
  const rango = max - min || 1;
  const paso = ancho / (valores.length - 1);

  const puntos = valores
    .map((v, i) => `${i * paso},${alto - ((v - min) / rango) * (alto - 2) - 1}`)
    .join(" ");

  // One is the break-even line: below it the campaign loses money.
  const y1 = alto - ((1 - min) / rango) * (alto - 2) - 1;
  const cruza = y1 > 0 && y1 < alto;

  return (
    <svg width={ancho} height={alto} className="inline-block align-middle">
      {cruza ? (
        <line
          x1="0"
          y1={y1}
          x2={ancho}
          y2={y1}
          className="stroke-borde"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      ) : null}
      <polyline
        points={puntos}
        fill="none"
        className="stroke-teal"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
