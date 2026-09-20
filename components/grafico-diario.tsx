"use client";

import { useState } from "react";
import { colorPlataforma } from "@/components/identidad";
import { TooltipUtm, detalleDe } from "@/components/tooltip-utm";
import { entero, mesCorto, porcentaje } from "@/lib/ui/format";
import type { Desglose } from "@/lib/desglose";

/**
 * Thirty days stacked by platform, for whichever metric the cards selected.
 *
 * The bars are thin because there are thirty of them, and the point is the
 * composition rather than any single day's height. Platforms are ordered by
 * volume so the stack does not reshuffle from one render to the next.
 *
 * Thin bars are hard to point at, so each day carries a full-height invisible
 * target the width of its slot: the pointer only has to be somewhere in the
 * column, not on the bar. The tooltip breaks the day down by raw utm_source.
 */
export function GraficoDiario({
  datos,
  rate,
  titulo,
}: {
  datos: Desglose;
  rate: boolean;
  titulo: string;
}) {
  const [activo, setActivo] = useState<number | null>(null);

  if (datos.barras.length === 0) {
    return (
      <p className="mt-3 text-sm text-sec">
        Todavía no hay datos diarios para {titulo.toLowerCase()}. El job los
        escribe junto con la mensual.
      </p>
    );
  }

  const fechas = [...new Set(datos.barras.map((f) => f.periodo))].sort();
  const porFecha = new Map<string, Map<string, number>>();
  for (const f of datos.barras) {
    if (!porFecha.has(f.periodo)) porFecha.set(f.periodo, new Map());
    porFecha.get(f.periodo)!.set(f.clave, f.valor);
  }

  // A rate is not stacked: adding 8,7% to 12,5% is not a number, so the bar is
  // the country's own rate and the platforms live in the tooltip.
  const alturaDe = (fecha: string) => {
    const m = porFecha.get(fecha);
    if (!m) return 0;
    const valores = [...m.values()];
    return rate
      ? Math.max(...valores, 0)
      : valores.reduce((a, b) => a + b, 0);
  };

  const totales = fechas.map(alturaDe);
  const maximo = Math.max(...totales, rate ? 0.01 : 1);

  const alto = 120;
  const ancho = 1100;
  const paso = ancho / fechas.length;
  const anchoBarra = Math.min(paso * 0.6, 18);

  const fechaActiva = activo === null ? null : fechas[activo]!;
  const detalle = fechaActiva
    ? detalleDe(
        datos.utm,
        fechaActiva,
        `${Number(fechaActiva.slice(8))} ${mesCorto(fechaActiva.slice(0, 7))}`,
        rate,
      )
    : null;

  return (
    <figure className="relative mt-3">
      {/* El viewBox arranca en −14 para que la etiqueta de la barra más alta
          tenga lugar: si empezara en 0 quedaría cortada por el borde, que es
          peor que no ponerla. */}
      <svg
        viewBox={`0 -14 ${ancho} ${alto + 36}`}
        className="h-[156px] w-full"
        onMouseLeave={() => setActivo(null)}
      >
        {fechas.map((fecha, i) => {
          const centro = i * paso + paso / 2;
          let acumulado = 0;
          return (
            <g key={fecha}>
              {datos.plataformas.map((plataforma, pi) => {
                const valor = porFecha.get(fecha)?.get(plataforma) ?? 0;
                if (valor === 0) return null;
                const base = alto - (acumulado / maximo) * alto;
                if (!rate) acumulado += valor;
                const tope = rate
                  ? alto - (valor / maximo) * alto
                  : alto - (acumulado / maximo) * alto;
                return (
                  <rect
                    key={plataforma}
                    x={centro - anchoBarra / 2}
                    y={tope}
                    width={anchoBarra}
                    height={Math.max((rate ? alto : base) - tope, 0)}
                    className={colorPlataforma(pi).replace("bg-", "fill-")}
                    opacity={activo === null || activo === i ? 1 : 0.35}
                  />
                );
              })}
            </g>
          );
        })}

        {/* El total de cada día, arriba de su barra.
            La guía de visualización dice no numerar todos los puntos, y tiene
            razón cuando el gráfico es sobre la forma. Acá el gráfico no tenía
            eje ni grilla, así que no había NINGUNA manera de leer un valor sin
            pasar el mouse — y apuntarle a una barra de 18px no es una manera.
            Van en tinta apagada y chicos: la forma se lee primero, el número
            está cuando lo buscás. El día apuntado se enciende. */}
        {fechas.map((fecha, i) => {
          const total = totales[i]!;
          if (total === 0) return null;
          return (
            <text
              key={`n-${fecha}`}
              x={i * paso + paso / 2}
              y={alto - (total / maximo) * alto - 4}
              textAnchor="middle"
              className={`text-[10px] ${
                activo === i ? "fill-texto" : "fill-ter"
              }`}
            >
              {rate ? porcentaje(total, 0) : entero(total)}
            </text>
          );
        })}

        {/* The hit targets go last so nothing painted over them steals the
            pointer. */}
        {fechas.map((fecha, i) => (
          <rect
            key={`hit-${fecha}`}
            x={i * paso}
            y={0}
            width={paso}
            height={alto}
            fill="transparent"
            onMouseEnter={() => setActivo(i)}
          />
        ))}

        {fechas.map((fecha, i) =>
          i % 7 === 0 ? (
            <text
              key={fecha}
              x={i * paso + paso / 2}
              y={alto + 14}
              textAnchor="middle"
              className="fill-ter text-[10px]"
            >
              {Number(fecha.slice(8))} {mesCorto(fecha.slice(0, 7))}
            </text>
          ) : null,
        )}
      </svg>

      {detalle ? (
        <TooltipUtm
          detalle={detalle}
          // Past the halfway mark the card flips to the left of the pointer so
          // it never runs off the edge.
          estilo={
            activo! < fechas.length / 2
              ? { left: `${((activo! + 0.5) / fechas.length) * 100}%`, marginLeft: 10 }
              : {
                  right: `${(1 - (activo! + 0.5) / fechas.length) * 100}%`,
                  marginRight: 10,
                }
          }
        />
      ) : null}

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sec">
        {datos.plataformas.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${colorPlataforma(i)}`} />
            {p}
          </span>
        ))}
        <span className="text-ter">
          máximo {rate ? porcentaje(maximo) : entero(maximo)} por día
        </span>
      </div>
    </figure>
  );
}
