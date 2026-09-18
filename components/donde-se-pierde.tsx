import { entero, porcentaje } from "@/lib/ui/format";
import type { Cohorte } from "@/lib/funnel-cohorte";

/**
 * Dónde se pierde la gente, ordenado por gente y no por porcentaje.
 *
 * Es la diferencia entre "el tramo 1ª→2ª pierde 21%" y "se lleva 297 personas,
 * un tercio de todo lo que perdés". Lo segundo es lo que dice dónde trabajar:
 * un tramo tardío puede tener la peor tasa y apenas mover veinte personas,
 * porque a esa altura ya queda poca gente para perder.
 *
 * La barra es relativa al peor tramo, no al total: la pregunta es cuál pesa
 * más comparado con los otros, y contra el total todas las barras quedarían
 * cortas y parecidas.
 */
export function DondeSePierde({ cohorte }: { cohorte: Cohorte }) {
  const tramos = cohorte.tramos
    .filter((t): t is typeof t & { perdidos: number } => t.perdidos !== null)
    .sort((a, b) => b.perdidos - a.perdidos);

  const peor = tramos[0];
  const total = tramos.reduce((a, t) => a + t.perdidos, 0);

  return (
    <aside className="rounded-lg border border-borde bg-surface px-4 py-3 lg:w-[340px] lg:shrink-0">
      <p className="text-xs uppercase tracking-wide text-ter">Dónde se pierde</p>

      {peor === undefined ? (
        <p className="mt-2 text-xs text-ter">
          La cohorte todavía no tiene edad para medir ningún tramo.
        </p>
      ) : (
        <>
          {/* Solo el primero lleva el peso sobre el total. En todas las filas
              sería ruido: la pregunta que contesta es "¿por dónde empiezo?",
              y esa se contesta una vez. */}
          <p className="mt-1 text-[11px] text-sec">
            El peor tramo se lleva{" "}
            <span className="text-texto">
              {total > 0 ? porcentaje(peor.perdidos / total, 0) : "—"}
            </span>{" "}
            de todo lo que se pierde hasta la 6ª.
          </p>

          <div className="mt-3 space-y-2.5">
            {tramos.map((t) => (
              <div key={t.tramo}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-texto">{t.etiqueta}</span>
                  <span className="shrink-0 tabular-nums text-sec">
                    {entero(t.perdidos)}
                    <span className="ml-1.5 text-ter">
                      {t.pctCaida === null ? "" : porcentaje(t.pctCaida, 0)}
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-sm bg-surface-2">
                  <div
                    className="h-1.5 rounded-sm bg-coral"
                    style={{
                      width: `${Math.max(2, (t.perdidos / peor.perdidos) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Los tramos que no se pueden medir todavía se nombran igual: si no,
          el panel parece decir que ahí no se pierde nadie. */}
      {cohorte.tramos.some((t) => t.perdidos === null) ? (
        <p className="mt-3 border-t border-borde pt-2 text-[11px] text-ter">
          Sin medir todavía:{" "}
          {cohorte.tramos
            .filter((t) => t.perdidos === null)
            .map((t) => t.etiqueta)
            .join(" · ")}
        </p>
      ) : null}
    </aside>
  );
}
