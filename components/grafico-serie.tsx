"use client";

import { useState } from "react";
import { mesCorto, entero, porcentaje, usd, decimal } from "@/lib/ui/format";
import { TooltipUtm, detalleDe } from "@/components/tooltip-utm";
import type { Punto } from "@/lib/desglose";

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
  /** The metric's own colour, the same one its card carries. */
  trazo: string;
  relleno: string;
  /** A second country is drawn lighter, in the same colour. */
  atenuada?: boolean;
};

export type Techo = { valor: number; etiqueta: string };

/**
 * How to print a number, as a name rather than a function.
 *
 * This is a client component, and a function cannot cross the boundary from a
 * server component: passing one throws at request time, which a `force-dynamic`
 * page only finds out in production. A name serializes.
 */
export type FormatoId = "entero" | "porcentaje" | "usd" | "decimal";

const FORMATO: Record<FormatoId, (n: number | null) => string> = {
  entero: (n) => entero(n),
  porcentaje: (n) => porcentaje(n),
  usd: (n) => usd(n, 1),
  decimal: (n) => decimal(n),
};

export function GraficoSerie({
  series,
  tipo,
  techos = [],
  formatoId,
  identidad,
  apiladas = false,
  utm = [],
  rate = false,
}: {
  series: Serie[];
  tipo: "barras" | "linea";
  techos?: Techo[];
  formatoId: FormatoId;
  /** Which country is on screen. An accent, never a recolouring. */
  identidad?: { punto: string; nombre: string };
  /**
   * Stack the countries instead of drawing them side by side. Only for
   * counts: stacking a rate would add two percentages, which is not a number.
   */
  apiladas?: boolean;
  /** Raw utm_source per month, for the tooltip. */
  utm?: Punto[];
  /** A rate is not summed, so the tooltip shows each source's own value. */
  rate?: boolean;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const valores = series.flatMap((s) =>
    s.puntos.filter((p) => p.valor !== null).map((p) => p.valor!),
  );

  const vacia = valores.length === 0;
  if (vacia && techos.length === 0) {
    return (
      <p className="mt-6 text-sm text-sec">
        Esta serie todavía no tiene datos. El gasto mensual se carga en Admin y
        aparece acá.
      </p>
    );
  }

  const meses = series[0]!.puntos;
  const maximo = apiladas
    ? Math.max(
        ...meses.map((_, i) =>
          series.reduce((a, s) => a + (s.puntos[i]?.valor ?? 0), 0),
        ),
        ...techos.map((t) => t.valor),
      )
    : Math.max(...valores, ...techos.map((t) => t.valor));
  const referencias = escalaY(maximo);
  const tope = referencias[referencias.length - 1]!;

  // The viewBox is the drawing at its intended size: 1352 wide, which is what
  // the 1400px container leaves inside its padding, and 260 tall in total. At
  // the design width it renders 1:1; narrower than that it scales down inside
  // the fixed 260px box rather than stretching, so the labels never distort.
  const ancho = 1352;
  const alto = 218;
  const margenIzq = 54;
  // Room above the plot: without it the top Y reference and a high ceiling
  // label get clipped by the viewBox.
  const margenSup = 14;
  const util = ancho - margenIzq;
  const paso = util / meses.length;
  const escala = (v: number) => margenSup + alto - (v / (tope || 1)) * alto;

  // Wide bars: three fifths of the slot. A third of the slot left each month
  // reserving space the bar did not use, and twelve thin bars on a wide screen
  // read as a scatter rather than a series. Capped so a three-month range does
  // not draw slabs.
  const anchoBarra = Math.min(paso * 0.6, 88);

  const marca = identidad ? (
    <figcaption className="flex items-center gap-1.5 text-[11px] text-ter">
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${identidad.punto}`} />
      {identidad.nombre}
    </figcaption>
  ) : null;

  const mesActivo = activo === null ? null : meses[activo]?.mes;
  const detalle = mesActivo
    ? detalleDe(utm, mesActivo, mesCorto(mesActivo), rate)
    : null;

  return (
    <figure className="relative mt-3">
      {marca}
      <svg
        viewBox={`0 0 ${ancho} ${margenSup + alto + 28}`}
        className="h-[260px] w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Serie de ${meses.length} meses`}
        onMouseLeave={() => setActivo(null)}
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
              {FORMATO[formatoId](r)}
            </text>
          </g>
        ))}

        {techos.map((techo) => (
          <g key={techo.etiqueta}>
            {techo.valor === Math.min(...techos.map((t) => t.valor)) ? (
              <rect
                x={margenIzq}
                y={escala(techo.valor)}
                width={util}
                height={margenSup + alto - escala(techo.valor)}
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
          ? meses.map((mes, i) => {
              const centro = margenIzq + i * paso + paso / 2;
              const total = series.reduce(
                (a, serie) => a + (serie.puntos[i]?.valor ?? 0),
                0,
              );
              if (total === 0) return null;

              // Stacked from the baseline up, so the bar's height is the
              // total and each segment is its country's share of it.
              let acumulado = 0;
              return (
                <g key={mes.mes}>
                  {series.map((serie, si) => {
                    const valor = serie.puntos[i]?.valor;
                    if (valor === null || valor === undefined) return null;
                    const base = escala(acumulado);
                    acumulado += valor;
                    const tope = escala(acumulado);
                    return (
                      <rect
                        key={si}
                        x={centro - anchoBarra / 2}
                        y={tope}
                        width={anchoBarra}
                        height={base - tope}
                        className={serie.relleno}
                        opacity={serie.atenuada ? 0.5 : 1}
                      />
                    );
                  })}
                  <text
                    x={centro}
                    y={escala(total) - 5}
                    textAnchor="middle"
                    className="fill-sec text-[10px]"
                  >
                    {FORMATO[formatoId](total)}
                  </text>
                </g>
              );
            })
          : series.map((serie, si) => (
              <g key={si}>
                <path
                  d={camino(serie.puntos, margenIzq, paso, escala)}
                  fill="none"
                  strokeWidth={1.75}
                  className={serie.trazo}
                  opacity={serie.atenuada ? 0.5 : 1}
                />
                {serie.puntos.map((p, i) =>
                  p.valor === null ? null : (
                    <circle
                      key={p.mes}
                      cx={margenIzq + i * paso + paso / 2}
                      cy={escala(p.valor)}
                      r={2.5}
                      className={serie.relleno}
                    />
                  ),
                )}
              </g>
            ))}

        {meses.map((p, i) => (
          <text
            key={p.mes}
            x={margenIzq + i * paso + paso / 2}
            y={margenSup + alto + 15}
            textAnchor="middle"
            className="fill-ter text-[10px]"
          >
            {etiquetaMes(meses, i)}
            {p.enCurso ? " ·" : ""}
          </text>
        ))}

        {/* Full-height targets the width of each slot, last so nothing painted
            over them steals the pointer. */}
        {meses.map((p, i) => (
          <rect
            key={`hit-${p.mes}`}
            x={margenIzq + i * paso}
            y={margenSup}
            width={paso}
            height={alto}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
          />
        ))}
      </svg>

      {detalle ? (
        <TooltipUtm
          detalle={detalle}
          estilo={
            activo! < meses.length / 2
              ? {
                  left: `${((margenIzq + (activo! + 0.5) * paso) / ancho) * 100}%`,
                  marginLeft: 10,
                }
              : {
                  right: `${(1 - (margenIzq + (activo! + 0.5) * paso) / ancho) * 100}%`,
                  marginRight: 10,
                }
          }
        />
      ) : null}

      {vacia ? (
        <p className="mt-1 text-[11px] text-sec">
          Sin datos para esta serie. La banda marca el LTV; falta cargar el
          gasto mensual en Admin para que aparezca la línea.
        </p>
      ) : null}

      {series.length > 1 && !vacia ? (
        <div className="mt-1 flex flex-wrap gap-x-5 text-[11px] text-ter">
          {series.map((s) => (
            <span key={s.nombre} className="flex items-center gap-1.5">
              <span
              className={`inline-block h-2 w-2 rounded-sm ${s.relleno.replace("fill-", "bg-")}`}
              style={s.atenuada ? { opacity: 0.5 } : undefined}
            />
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
