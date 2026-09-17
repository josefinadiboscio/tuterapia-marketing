import { entero, porcentaje } from "@/lib/ui/format";
import type { FilaEtapa } from "@/lib/funnel";

/**
 * Stage by stage, with the purchase drawn as the base.
 *
 * Written literally, one class per stage, because Tailwind reads the source as
 * text: a class built from a template literal never reaches the stylesheet.
 * The ramp runs orange to deep teal so the colour says which half of the
 * funnel a stage belongs to — buying or staying — without reading the label.
 */
const COLOR = ["bg-e0", "bg-e2", "bg-e3", "bg-e4", "bg-e5", "bg-e6", "bg-e7"];

export function TablaEtapas({ filas }: { filas: FilaEtapa[] }) {
  const base = filas[0]?.llegaron ?? 0;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
          <th className="pb-2 font-normal">Etapa</th>
          <th className="pb-2 font-normal" />
          <th className="pb-2 text-right font-normal">
            <span title="Compradores del período con tiempo suficiente para llegar a esta etapa">
              n
            </span>
          </th>
          <th className="pb-2 text-right font-normal">Llegaron</th>
          <th className="pb-2 text-right font-normal">
            <span title="Sobre los compradores de esta etapa">% del total</span>
          </th>
          <th className="pb-2 text-right font-normal">Cayeron</th>
          <th className="pb-2 text-right font-normal">
            <span title="Contra la etapa anterior, sobre la misma población">
              % caída
            </span>
          </th>
          <th className="pb-2 text-right font-normal">
            <span title="Cambio de esa caída contra el período anterior, en puntos">
              Δ pp
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.nro} className="border-b border-borde">
            <td className="py-2 text-texto">{f.etiqueta}</td>

            <td className="w-[38%] py-2">
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

            <td
              className="py-2 text-right tabular-nums text-ter"
              title={f.corte ? `Compras hasta el ${f.corte}` : undefined}
            >
              {f.n === null ? "" : entero(f.n)}
            </td>
            <td className="py-2 text-right tabular-nums text-texto">
              {f.llegaron === null ? "" : entero(f.llegaron)}
            </td>
            <td className="py-2 text-right tabular-nums text-sec">
              {f.pctDelTotal === null ? "" : porcentaje(f.pctDelTotal)}
            </td>
            <td className="py-2 text-right tabular-nums text-coral">
              {f.cayeron === null ? "" : entero(f.cayeron)}
            </td>
            <td className="py-2 text-right tabular-nums text-coral">
              {f.caida === null ? "" : porcentaje(f.caida)}
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
