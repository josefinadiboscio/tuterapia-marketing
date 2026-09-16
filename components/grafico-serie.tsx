import { mesCorto } from "@/lib/ui/format";

/**
 * The chart of each General block: bars for volume, a line for economy.
 *
 * Bars are narrow and separated, each carrying its own value on top — if you
 * have to estimate a height against an axis, the number is not really there.
 * The Y axis keeps two or three references: it is a scale, not a ruler.
 *
 * The month still running is drawn faded with a dot on its axis label. That is
 * the only place the distinction appears; the cards say nothing about it.
 *
 * With CAC selected the chart draws the LTV as a ceiling. While the line stays
 * under it each patient earns back more than they cost.
 */
export type PuntoSerie = { mes: string; valor: number | null; enCurso: boolean };

export type Serie = {
  nombre: string;
  puntos: PuntoSerie[];
  /** Classes from the block's colour family, never a loose colour. */
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

  const meses = series[0]!.puntos;
  const maximo = Math.max(...valores, ...techos.map((t) => t.valor));
  const referencias = escalaY(maximo);
  const tope = referencias[referencias.length - 1]!;

  const ancho = 960;
  const alto = 190;
  const margenIzq = 54;
  const util = ancho - margenIzq;
  const paso = util / meses.length;
  const escala = (v: number) => alto - (v / (tope || 1)) * alto;

  // Narrow bars: a third of the slot, so the gap reads as wide as the bar.
  const anchoBarra = Math.min(paso * 0.34, 26);

  return (
    <figure className="mt-5">
      <svg
        viewBox={`0 0 ${ancho} ${alto + 34}`}
        className="w-full"
        role="img"
        aria-label={`Serie de ${meses.length} meses`}
      >
        {referencias.map((r) => (
          <g key={r}>
            <line
              x1={margenIzq}
              x2={ancho}
              y1={escala(r)}
              y2={escala(r)}
              className="stroke-borde-suave"
              strokeWidth={1}
            />
            <text
              x={margenIzq - 8}
              y={escala(r) + 3}
              textAnchor="end"
              className="fill-ter text-[10px]"
            >
              {formato(r)}
            </text>
          </g>
        ))}

        {techos.map((techo, i) => (
          <g key={techo.etiqueta}>
            {i === 0 ? (
              <rect
                x={margenIzq}
                y={escala(techo.valor)}
                width={util}
                height={alto - escala(techo.valor)}
                className="fill-teal"
                opacity={0.08}
              />
            ) : null}
            <line
              x1={margenIzq}
              x2={ancho}
              y1={escala(techo.valor)}
              y2={escala(techo.valor)}
              className="stroke-teal-deep"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <text
              x={margenIzq + 4}
              y={escala(techo.valor) - 5}
              className="fill-teal-deep text-[10px]"
            >
              {techo.etiqueta}
            </text>
          </g>
        ))}

        {tipo === "barras"
          ? series.flatMap((serie, si) =>
              serie.puntos.map((p, i) => {
                if (p.valor === null) return null;
                const centro = margenIzq + i * paso + paso / 2;
                const y = escala(p.valor);
                return (
                  <g key={`${si}-${p.mes}`} opacity={p.enCurso ? 0.4 : 1}>
                    <rect
                      x={centro - anchoBarra / 2}
                      y={y}
                      width={anchoBarra}
                      height={alto - y}
                      className={serie.relleno}
                    />
                    <text
                      x={centro}
                      y={y - 5}
                      textAnchor="middle"
                      className="fill-sec text-[10px]"
                    >
                      {formato(p.valor)}
                    </text>
                  </g>
                );
              }),
            )
          : series.map((serie, si) => (
              <g key={si}>
                <path
                  d={camino(serie.puntos, margenIzq, paso, escala)}
                  fill="none"
                  strokeWidth={1.75}
                  className={serie.trazo}
                />
                {serie.puntos.map((p, i) =>
                  p.valor === null ? null : (
                    <circle
                      key={p.mes}
                      cx={margenIzq + i * paso + paso / 2}
                      cy={escala(p.valor)}
                      r={2.5}
                      className={serie.relleno}
                      opacity={p.enCurso ? 0.4 : 1}
                    />
                  ),
                )}
              </g>
            ))}

        {meses.map((p, i) => (
          <text
            key={p.mes}
            x={margenIzq + i * paso + paso / 2}
            y={alto + 16}
            textAnchor="middle"
            className={p.enCurso ? "fill-dim text-[10px]" : "fill-ter text-[10px]"}
          >
            {etiquetaMes(meses, i)}
            {p.enCurso ? " ·" : ""}
          </text>
        ))}
      </svg>

      {series.length > 1 ? (
        <div className="mt-1 flex flex-wrap gap-x-5 text-[11px] text-ter">
          {series.map((s) => (
            <span key={s.nombre} className="flex items-center gap-1.5">
              <span className={`inline-block h-0.5 w-4 ${s.relleno}`} />
              {s.nombre}
            </span>
          ))}
        </div>
      ) : null}
    </figure>
  );
}

/** The year appears only where the series crosses into a new one. */
function etiquetaMes(puntos: PuntoSerie[], i: number): string {
  const anterior = puntos[i - 1];
  const cambiaAnio =
    !anterior || anterior.mes.slice(0, 4) !== puntos[i]!.mes.slice(0, 4);
  return mesCorto(puntos[i]!.mes, cambiaAnio);
}

/** Two or three round references, never a full ruler. */
function escalaY(maximo: number): number[] {
  if (maximo <= 0) return [0];
  const magnitud = 10 ** Math.floor(Math.log10(maximo));
  const paso = [1, 2, 2.5, 5, 10]
    .map((m) => m * magnitud)
    .find((p) => maximo / p <= 2.2)!;
  const tope = Math.ceil(maximo / paso) * paso;
  return tope / paso >= 2 ? [0, tope / 2, tope] : [0, tope];
}

function camino(
  puntos: PuntoSerie[],
  margen: number,
  paso: number,
  escala: (v: number) => number,
): string {
  return puntos
    .map((p, i) =>
      p.valor === null
        ? null
        : ([margen + i * paso + paso / 2, escala(p.valor)] as const),
    )
    .filter((p): p is readonly [number, number] => p !== null)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
}
