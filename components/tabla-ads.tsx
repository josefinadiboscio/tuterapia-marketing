"use client";

import { useState } from "react";
import { Chispa } from "@/components/chispa";
import { entero, usd, porcentaje, SIN_DATO } from "@/lib/ui/format";
import { ETIQUETAS, FONDO, TONO, type Veredicto } from "@/lib/veredicto";
import type { FilaPlataforma } from "@/lib/ads";

/**
 * Two levels, one table.
 *
 * The platform row carries the money — spend, CAC, ratio, verdict — because
 * that is the grain spend is planned at. The campaign rows underneath carry
 * only what exists per campaign: how much traffic it brought and how much of
 * it converted. The money columns are absent there rather than dashed: a dash
 * says "we could not measure it", and the truth is that the question does not
 * apply.
 */
export function TablaAds({
  filas,
}: {
  filas: (FilaPlataforma & { veredicto: Veredicto })[];
}) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const alternar = (clave: string) =>
    setAbiertas((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  return (
    <table className="mt-8 w-full text-sm">
      <thead>
        <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
          <th className="pb-2 font-normal">Plataforma</th>
          <th className="pb-2 text-right font-normal">Gasto</th>
          <th className="pb-2 text-right font-normal">Registros</th>
          <th className="pb-2 text-right font-normal">Pac. nuevos</th>
          <th className="pb-2 text-right font-normal">Conversión</th>
          <th className="pb-2 text-right font-normal">CAC</th>
          <th className="pb-2 text-right font-normal">Ratio 6 sem.</th>
          <th className="pb-2 text-right font-normal">Decisión</th>
        </tr>
      </thead>

      {filas.map((f) => {
        const clave = `${f.pais}-${f.plataforma}`;
        const abierta = abiertas.has(clave);

        return (
          <tbody key={clave} className="border-b border-borde">
            <tr
              className={`cursor-pointer ${FONDO[f.veredicto]}`}
              onClick={() => alternar(clave)}
            >
              <td className="py-2">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-ter transition-transform ${abierta ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                  {f.plataforma}
                </div>
                <div className="pl-4 text-xs text-ter">
                  {f.pais} · {f.campanas.length}{" "}
                  {f.campanas.length === 1 ? "campaña" : "campañas"}
                </div>
              </td>
              <td className="py-2 text-right">{usd(f.gasto)}</td>
              <td className="py-2 text-right">{entero(f.registros)}</td>
              <td className="py-2 text-right">{entero(f.pacientes_nuevos)}</td>
              <td className="py-2 text-right">{porcentaje(f.conversion)}</td>
              <td className="py-2 text-right">{usd(f.cac, 1)}</td>
              <td className="py-2 text-right">
                <span className="inline-flex items-center gap-2">
                  <Chispa valores={f.historia} />
                  <span className="w-9 text-right">
                    {f.ratio === null ? SIN_DATO : f.ratio.toFixed(2)}
                  </span>
                </span>
              </td>
              <td className={`py-2 text-right ${TONO[f.veredicto]}`}>
                {ETIQUETAS[f.veredicto]}
              </td>
            </tr>

            {abierta
              ? f.campanas.map((c) => (
                  <tr key={c.utm_source} className="bg-surface-2/40 text-xs">
                    <td className="py-1.5 pl-6 text-sec">{c.utm_source}</td>
                    <td className="py-1.5 text-right text-sec">
                      {entero(c.registros)}
                    </td>
                    <td className="py-1.5 text-right text-sec">
                      {entero(c.pacientes_nuevos)}
                    </td>
                    <td
                      className={`py-1.5 text-right ${
                        c.alerta ? "text-coral" : "text-sec"
                      }`}
                    >
                      {porcentaje(c.conversion)}
                    </td>
                    {/* Spend, CAC, ratio and a verdict do not exist per
                        campaign. The cells stay empty rather than dashed. */}
                    <td colSpan={4} />
                  </tr>
                ))
              : null}
          </tbody>
        );
      })}
    </table>
  );
}
