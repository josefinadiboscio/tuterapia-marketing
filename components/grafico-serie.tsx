/**
 * The one chart on General: bars for the volume block, a line for the economy
 * block, over 6, 12 or 24 months.
 *
 * Series use stops of the brand ramp, never different hues. The month still
 * running is drawn in the same shape at lower opacity — the single time
 * convention of the app is that what can still move looks faded.
 *
 * With CAC selected the chart draws the LTV as a ceiling. While the line stays
 * under it each patient earns back more than they cost; when it crosses, they
 * do not. That is the question of the block, so it is drawn, not written.
 */
export type PuntoSerie = { mes: string; valor: number | null; enCurso: boolean };

export type Serie = {
  nombre: string;
  puntos: PuntoSerie[];
  /** Brand ramp stop, as a Tailwind class built from the theme tokens. */
  trazo: string;
  relleno: string;
};

export type Techo = { valor: number; etiqueta: string };

export function GraficoSerie({
  series,
  tipo,
  techos = [],
  formato,
}: {
  series: Serie[];
  tipo: "barras" | "linea";
  techos?: Techo[];
  formato: (n: number | null) => string;
}) {
  const valores = series.flatMap((s) =>
    s.puntos.filter((p) => p.valor !== null).map((p) => p.valor!),
  );

  if (valores.length === 0) {
    return (
      <p className="mt-6 text-sm text-sec">
        Esta serie todavía no tiene datos. El gasto mensual se carga en Admin y
        aparece acá.
      </p>
    );
  }

  const ancho = 960;
  const alto = 200;
  const maximo = Math.max(...valores, ...techos.map((t) => t.valor));
  const escala = (v: number) => alto - (v / (maximo || 1)) * alto;

  const meses = series[0]!.puntos;
  const paso = ancho / meses.length;
  const etiquetas = meses.length <= 12 ? meses : meses.filter((_, i) => i % 2 === 0);

  return (
    <figure className="mt-5">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="h-52 w-full overflow-visible"
        role="img"
        aria-label={`Serie de ${meses.length} meses`}
      >
        {techos.map((techo, i) => (
          <g key={techo.etiqueta}>
            {i === 0 ? (
              <rect
                x={0}
                y={escala(techo.valor)}
                width={ancho}
                height={alto - escala(techo.valor)}
                className="fill-chart-band"
              />
            ) : null}
            <line
              x1={0}
              x2={ancho}
              y1={escala(techo.valor)}
              y2={escala(techo.valor)}
              className="stroke-chart-line"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={4}
              y={escala(techo.valor) - 5}
              className="fill-sec text-[11px]"
            >
              {techo.etiqueta}
            </text>
          </g>
        ))}

        {tipo === "barras"
          ? series.flatMap((serie, si) =>
              serie.puntos.map((p, i) =>
                p.valor === null ? null : (
                  <rect
                    key={`${si}-${p.mes}`}
                    x={i * paso + paso * 0.18}
                    y={escala(p.valor)}
                    width={paso * 0.64}
                    height={alto - escala(p.valor)}
                    className={serie.relleno}
                    opacity={p.enCurso ? 0.4 : 1}
                  />
                ),
              ),
            )
          : series.map((serie, si) => (
              <g key={si}>
                <path
                  d={camino(serie.puntos, paso, escala)}
                  fill="none"
                  strokeWidth={1.75}
                  className={serie.trazo}
                />
                {serie.puntos.map((p, i) =>
                  p.valor === null ? null : (
                    <circle
                      key={p.mes}
                      cx={i * paso + paso / 2}
                      cy={escala(p.valor)}
                      r={2.5}
                      className={serie.relleno}
                      opacity={p.enCurso ? 0.4 : 1}
                    />
                  ),
                )}
              </g>
            ))}
      </svg>

      <figcaption className="mt-2 flex justify-between text-[11px] text-ter">
        {etiquetas.map((p) => (
          <span key={p.mes}>{p.mes.slice(2)}</span>
        ))}
      </figcaption>

      <div className="mt-2 flex flex-wrap items-center gap-x-5 text-[11px] text-ter">
        <span>Máximo {formato(maximo)}</span>
        {series.length > 1
          ? series.map((s) => (
              <span key={s.nombre} className="flex items-center gap-1.5">
                <span className={`inline-block h-0.5 w-4 ${s.relleno}`} />
                {s.nombre}
              </span>
            ))
          : null}
      </div>
    </figure>
  );
}

function camino(
  puntos: PuntoSerie[],
  paso: number,
  escala: (v: number) => number,
): string {
  return puntos
    .map((p, i) =>
      p.valor === null
        ? null
        : ([i * paso + paso / 2, escala(p.valor)] as const),
    )
    .filter((p): p is readonly [number, number] => p !== null)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}
