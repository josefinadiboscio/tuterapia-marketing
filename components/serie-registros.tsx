import { mediaMovil } from "@/lib/movimientos";
import { entero } from "@/lib/ui/format";

/**
 * Thirty days of registrations: raw bars with a seven-day moving average on
 * top. The weekend pattern is strong enough to hide the trend, and the average
 * is what makes the trend readable.
 *
 * One hue, two weights — bars light, average dark — because they are the same
 * series seen two ways, not two categories (DESIGN.md). The line starts on the
 * seventh day: before that there is no full window, and an average over three
 * days drawn as if it were over seven is a different number in the same shape.
 *
 * Inline SVG: one chart, no library, no interaction that hides a value behind
 * a tooltip.
 */
export function SerieRegistros({
  serie,
}: {
  serie: { fecha: string; registros: number }[];
}) {
  if (serie.length === 0) return null;

  const valores = serie.map((d) => d.registros);
  const media = mediaMovil(valores, 7);
  const maximo = Math.max(...valores, 1);

  const ancho = 720;
  const alto = 140;
  const paso = ancho / serie.length;
  const anchoBarra = Math.max(paso - 3, 2);

  const puntos = media
    .map((valor, i) =>
      valor === null
        ? null
        : [i * paso + paso / 2, alto - (valor / maximo) * alto],
    )
    .filter((p): p is number[] => p !== null);

  const linea = puntos
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x!.toFixed(1)},${y!.toFixed(1)}`)
    .join(" ");

  const etiquetas = [0, Math.floor(serie.length / 2), serie.length - 1];

  return (
    <figure className="mt-3">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-36 w-full"
        role="img"
        aria-label={`Registros diarios de los últimos ${serie.length} días, con media móvil de 7 días`}
      >
        {serie.map((dia, i) => {
          const altura = (dia.registros / maximo) * alto;
          return (
            <rect
              key={dia.fecha}
              x={i * paso + (paso - anchoBarra) / 2}
              y={alto - altura}
              width={anchoBarra}
              height={altura}
              className="fill-chart-fill"
            />
          );
        })}
        <path
          d={linea}
          fill="none"
          strokeWidth={1.5}
          className="stroke-chart-line"
        />
      </svg>

      <figcaption className="mt-1 flex justify-between text-xs tabular-nums text-ter">
        {etiquetas.map((i) => (
          <span key={i}>{serie[i]!.fecha.slice(5)}</span>
        ))}
      </figcaption>
      <p className="mt-1 text-xs text-ter">
        Línea: media móvil de 7 días, arranca el séptimo. Máximo{" "}
        {entero(maximo)}.
      </p>
    </figure>
  );
}
