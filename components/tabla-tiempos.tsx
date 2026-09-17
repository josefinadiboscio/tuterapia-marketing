import { entero } from "@/lib/ui/format";
import type { FilaTiempo } from "@/lib/funnel";

/**
 * How long each trip takes.
 *
 * Same ramp as the stage table, taken from where the trip starts, so the two
 * tables read as one thing: the row that loses the most people above and how
 * long that same step takes below.
 */
const COLOR = ["bg-e0", "bg-e2", "bg-e3", "bg-e4", "bg-e5", "bg-e6"];

export function TablaTiempos({ filas }: { filas: FilaTiempo[] }) {
  const mayor = Math.max(1, ...filas.map((f) => f.mediana ?? 0));

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
          <th className="pb-2 font-normal">Tramo</th>
          <th className="pb-2 font-normal" />
          <th className="pb-2 text-right font-normal">
            <span title="Días entre una etapa y la siguiente, en día local">
              Mediana
            </span>
          </th>
          <th className="pb-2 text-right font-normal">p80</th>
          <th className="pb-2 text-right font-normal">
            <span title="Cambio de la mediana contra el período anterior">
              Δ días
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={f.tramo} className="border-b border-borde">
            <td className="py-2 text-texto">{f.etiqueta}</td>

            <td className="w-[38%] py-2">
              {f.mediana === null ? null : (
                <div className="h-2.5 w-full rounded-sm bg-surface-2">
                  <div
                    className={`h-2.5 rounded-sm ${COLOR[i] ?? COLOR.at(-1)!}`}
                    style={{ width: `${Math.max(2, (f.mediana / mayor) * 100)}%` }}
                  />
                </div>
              )}
            </td>

            <td
              className="py-2 text-right tabular-nums text-texto"
              title={f.n === null ? undefined : `${f.n} pacientes`}
            >
              {f.mediana === null ? "" : `${entero(f.mediana)} d`}
            </td>
            <td className="py-2 text-right tabular-nums text-sec">
              {f.p80 === null ? "" : `${entero(f.p80)} d`}
            </td>
            <td className="py-2 text-right tabular-nums">
              <DeltaDias valor={f.deltaDias} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Coming back sooner is better, so fewer days is the green one. */
function DeltaDias({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  if (valor === 0) return <span className="text-ter">=</span>;
  return (
    <span className={valor < 0 ? "text-green" : "text-ambar"}>
      {valor > 0 ? "+" : "−"}
      {Math.abs(valor)}
    </span>
  );
}
