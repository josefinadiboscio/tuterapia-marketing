import { entero, porcentaje } from "@/lib/ui/format";
import type { FilaEtapa } from "@/lib/funnel";

/**
 * Stage by stage, with the purchase drawn as the base.
 *
 * Un solo criterio, y es la gente que está EN cada etapa:
 *
 *  · "Llegaron" y "% del total" — cuánta gente queda a esta altura.
 *  · "Se quedaron acá" — cuánta gente TERMINÓ acá: llegó a esta etapa y no
 *    pasó a la siguiente. Es la pregunta que uno hace en voz alta ("¿cuántos
 *    hicieron una sola sesión?").
 *
 * La tabla no muestra el escalón de entrada a cada etapa. Es la misma tabla
 * leída al revés, y era el motivo de que la fila de la 1ª sesión pareciera
 * decir que solo el 5% se cae ahí: ese 5% es de "Compraron" —pagó y no se
 * sentó nunca— y no de la 1ª sesión, donde se termina un tercio.
 *
 * Written literally, one class per stage, because Tailwind reads the source as
 * text: a class built from a template literal never reaches the stylesheet.
 * The ramp runs orange to deep teal so the colour says which half of the
 * funnel a stage belongs to — buying or staying — without reading the label.
 */
const COLOR = ["bg-e0", "bg-e1", "bg-e2", "bg-e3", "bg-e4", "bg-e5", "bg-e6"];

export function TablaEtapas({ filas }: { filas: FilaEtapa[] }) {
  const base = filas[0]?.llegaron ?? 0;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
          <th className="pb-2 font-normal">Etapa</th>
          <th className="pb-2 font-normal" />
          <th className="pb-2 text-right font-normal">Llegaron</th>
          <th className="pb-2 text-right font-normal">
            <span title="Sobre los compradores con tiempo suficiente para esta etapa">
              % del total
            </span>
          </th>
          <th className="pb-2 text-right font-normal">
            <span title="Llegaron hasta acá y no siguieron: acá terminó su terapia. Sobre los compradores con tiempo suficiente para responder la pregunta.">
              Se quedaron acá
            </span>
          </th>
          <th className="pb-2 text-right font-normal">
            <span title="Cambio de ese porcentaje contra el período anterior, en puntos">
              Δ pp
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.nro} className="border-b border-borde">
            <td className="py-2">
              <div className="text-texto">{f.etiqueta}</div>
              {/* The n of each stage: its own base, and up to when. Under the
                  label rather than in a column of its own — it qualifies the
                  row, it is not a measure of it. */}
              {f.n === null ? null : (
                <div className="text-[11px] text-ter">
                  n {entero(f.n)}
                  {f.corte ? ` · compras hasta ${f.corte}` : ""}
                </div>
              )}
            </td>

            <td className="w-[26%] py-2">
              {/* The bar is the accumulated retention against the purchase,
                  which is the column beside it drawn. */}
              {f.llegaron === null || base === 0 ? null : (
                <div className="h-2.5 w-full rounded-sm bg-surface-2">
                  <div
                    className={`h-2.5 rounded-sm ${COLOR[i] ?? COLOR.at(-1)!}`}
                    style={{ width: `${Math.min(100, (f.llegaron / base) * 100)}%` }}
                  />
                </div>
              )}
            </td>

            <td className="py-2 text-right tabular-nums text-texto">
              {f.llegaron === null ? "" : entero(f.llegaron)}
            </td>
            <td className="py-2 text-right tabular-nums text-sec">
              {f.pctDelTotal === null ? "" : porcentaje(f.pctDelTotal)}
            </td>

            <td
              className="py-2 text-right tabular-nums"
              title={
                f.pctDeLosQueLlegaron === null
                  ? undefined
                  : `${porcentaje(f.pctDeLosQueLlegaron)} de los que llegaron a esta etapa · compras hasta ${f.corteQuedaron}`
              }
            >
              {f.seQuedaron === null ? (
                ""
              ) : (
                <>
                  <span className="text-coral">{entero(f.seQuedaron)}</span>
                  <span className="ml-1.5 text-coral">
                    {f.pctSeQuedaron === null ? "" : porcentaje(f.pctSeQuedaron)}
                  </span>
                </>
              )}
            </td>

            <td className="py-2 text-right tabular-nums">
              <DeltaPp valor={f.deltaPp} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Less drop is better, so a negative delta is the green one. */
function DeltaPp({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const puntos = valor * 100;
  if (Math.abs(puntos) < 0.05) return <span className="text-ter">=</span>;
  const signo = puntos > 0 ? "+" : "−";
  return (
    <span className={puntos < 0 ? "text-green" : "text-ambar"}>
      {signo}
      {Math.abs(puntos).toFixed(1)}
    </span>
  );
}
