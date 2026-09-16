"use client";

import { useState } from "react";
import { entero, porcentaje } from "@/lib/ui/format";
import type { Etapa } from "@/lib/funnel";

/**
 * Written literally, one class per stage, because Tailwind scans the source as
 * text: a class built from a template literal never reaches the stylesheet.
 *
 * The ramp runs orange to deep teal, so the colour says which half of the
 * funnel a stage is in — acquisition or retention — without reading the label.
 */
const COLOR_ETAPA = [
  "bg-e0",
  "bg-e1",
  "bg-e2",
  "bg-e3",
  "bg-e4",
  "bg-e5",
  "bg-e6",
  "bg-e7",
  "bg-e8",
  "bg-e9",
  "bg-e10",
  "bg-e11",
];

/** Six is where the interesting drops are; the rest is there when looked for. */
const VISIBLES = 6;

export function Embudo({ etapas }: { etapas: Etapa[] }) {
  const [todas, setTodas] = useState(false);

  const base = etapas[0]?.valor ?? 0;
  const mostradas = todas ? etapas : etapas.slice(0, VISIBLES);
  const ocultas = etapas.length - VISIBLES;

  return (
    <section className="mt-6">
      {mostradas.map((etapa, i) => (
        <Paso
          key={etapa.nombre}
          etapa={etapa}
          previa={i > 0 ? etapas[i - 1]! : null}
          base={base}
          color={COLOR_ETAPA[i] ?? COLOR_ETAPA.at(-1)!}
        />
      ))}

      {ocultas > 0 ? (
        <button
          type="button"
          onClick={() => setTodas(!todas)}
          className="mt-3 rounded-md border border-borde px-2.5 py-1 text-xs text-sec hover:border-sec hover:text-texto"
        >
          {todas ? "Ver menos" : `Ver todas · ${ocultas} etapas más`}
        </button>
      ) : null}
    </section>
  );
}

/**
 * A stage, and above it the fall from the one before. The drop goes between
 * the bars rather than inside one: it is what the screen is about, not a
 * footnote on a bar.
 */
function Paso({
  etapa,
  previa,
  base,
  color,
}: {
  etapa: Etapa;
  previa: Etapa | null;
  base: number;
  color: string;
}) {
  const caida =
    previa?.valor && etapa.valor !== null
      ? {
          absoluta: previa.valor - etapa.valor,
          relativa: 1 - etapa.valor / previa.valor,
        }
      : null;

  const ancho = etapa.valor !== null && base > 0 ? (etapa.valor / base) * 100 : 0;

  return (
    <div>
      {previa ? (
        <div className="py-1.5 pl-1 text-xs" style={{ color: "var(--coral)" }}>
          {caida ? (
            <>
              −{entero(caida.absoluta)} · {porcentaje(caida.relativa)}
            </>
          ) : (
            /* Nothing has happened here yet. An empty line, not a sentence. */
            <span>&nbsp;</span>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm text-sec">{etapa.nombre}</span>
        <div className="h-7 flex-1 bg-surface-2">
          {etapa.valor !== null ? (
            <div
              className={`h-7 ${color}`}
              style={{ width: `${Math.max(ancho, 0.5)}%` }}
            />
          ) : (
            <div className="h-7 border border-dashed border-borde" />
          )}
        </div>
        <span className="w-20 shrink-0 text-right text-sm">
          {etapa.valor === null ? null : entero(etapa.valor)}
        </span>
      </div>
    </div>
  );
}
