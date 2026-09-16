"use client";

import { useState } from "react";
import { colorPlataforma } from "@/components/identidad";
import { entero, mesCorto } from "@/lib/ui/format";
import type { DiaPlataforma } from "@/lib/diario";

/**
 * Thirty days stacked by platform.
 *
 * The bars are thin because there are thirty of them, and the point is the
 * composition rather than any single day's height. Platforms are ordered by
 * volume so the stack does not reshuffle from one render to the next.
 *
 * Thin bars are hard to point at, so each day carries a full-height invisible
 * target the width of its slot: the pointer only has to be somewhere in the
 * column, not on the bar.
 */
export function GraficoDiario({
  filas,
  plataformas,
}: {
  filas: DiaPlataforma[];
  plataformas: string[];
}) {
  const [activo, setActivo] = useState<number | null>(null);

  if (filas.length === 0) {
    return (
      <p className="mt-3 text-sm text-sec">
        Todavía no hay datos diarios por plataforma. El job los escribe junto
        con la mensual.
      </p>
    );
  }

  const fechas = [...new Set(filas.map((f) => f.fecha))].sort();
  const porFecha = new Map<string, Map<string, number>>();
  for (const f of filas) {
    if (!porFecha.has(f.fecha)) porFecha.set(f.fecha, new Map());
    porFecha.get(f.fecha)!.set(f.plataforma, f.registros);
  }

  const totales = fechas.map((fecha) =>
    plataformas.reduce((a, p) => a + (porFecha.get(fecha)?.get(p) ?? 0), 0),
  );
  const maximo = Math.max(...totales, 1);

  const alto = 120;
  const ancho = 1100;
  const paso = ancho / fechas.length;
  const anchoBarra = Math.min(paso * 0.6, 18);

  const detalle =
    activo === null
      ? null
      : {
          fecha: fechas[activo]!,
          total: totales[activo]!,
          // Only the platforms that actually brought someone that day, biggest
          // first: a list of zeroes is not a detail.
          filas: plataformas
            .map((p, i) => ({
              plataforma: p,
              registros: porFecha.get(fechas[activo]!)?.get(p) ?? 0,
              color: colorPlataforma(i),
            }))
            .filter((f) => f.registros > 0)
            .sort((a, b) => b.registros - a.registros),
        };

  return (
    <figure className="relative mt-3">
      <svg
        viewBox={`0 0 ${ancho} ${alto + 22}`}
        className="h-[142px] w-full"
        onMouseLeave={() => setActivo(null)}
      >
        {fechas.map((fecha, i) => {
          const centro = i * paso + paso / 2;
          let acumulado = 0;
          return (
            <g key={fecha}>
              {plataformas.map((plataforma, pi) => {
                const valor = porFecha.get(fecha)?.get(plataforma) ?? 0;
                if (valor === 0) return null;
                const base = alto - (acumulado / maximo) * alto;
                acumulado += valor;
                const tope = alto - (acumulado / maximo) * alto;
                return (
                  <rect
                    key={plataforma}
                    x={centro - anchoBarra / 2}
                    y={tope}
                    width={anchoBarra}
                    height={base - tope}
                    className={colorPlataforma(pi).replace("bg-", "fill-")}
                    opacity={activo === null || activo === i ? 1 : 0.35}
                  />
                );
              })}
            </g>
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
        <div
          className="pointer-events-none absolute top-0 z-10 w-44 rounded-lg border border-borde bg-surface px-3 py-2 text-xs shadow-lg"
          // Past the halfway mark the card flips to the left of the pointer so
          // it never runs off the edge.
          style={
            activo! < fechas.length / 2
              ? { left: `${((activo! + 0.5) / fechas.length) * 100}%`, marginLeft: 10 }
              : { right: `${(1 - (activo! + 0.5) / fechas.length) * 100}%`, marginRight: 10 }
          }
        >
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sec">
              {Number(detalle.fecha.slice(8))} {mesCorto(detalle.fecha.slice(0, 7))}
            </span>
            <span className="text-texto">{entero(detalle.total)}</span>
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {detalle.filas.map((f) => (
              <li key={f.plataforma} className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 shrink-0 rounded-sm ${f.color}`} />
                <span className="flex-1 truncate text-sec">{f.plataforma}</span>
                <span className="tabular-nums text-texto">{entero(f.registros)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sec">
        {plataformas.map((p, i) => (
          <span key={p} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${colorPlataforma(i)}`} />
            {p}
          </span>
        ))}
        <span className="text-ter">máximo {entero(maximo)} por día</span>
      </div>
    </figure>
  );
}
