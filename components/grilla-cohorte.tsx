import { entero, porcentaje } from "@/lib/ui/format";
import { ULTIMA_ETAPA, type FilaCohorte } from "@/lib/funnel";

/**
 * Drop between consecutive sessions, one row per cohort.
 *
 * Intensity is the drop, so the eye lands on the expensive step without
 * reading a number. A cell the cohort has not had time to reach is dotted
 * rather than empty: empty would read as "no drop", which is the opposite of
 * "we do not know yet".
 *
 * The scale tops out at 60% on purpose. Past that everything would saturate to
 * the same block and the grid would stop ranking anything.
 */
const TECHO = 0.6;

export function GrillaCohorte({ filas }: { filas: FilaCohorte[] }) {
  if (filas.length === 0) {
    return (
      <p className="mt-3 text-sm text-sec">
        Todavía no hay cohortes con sesiones contadas.
      </p>
    );
  }

  const pasos = Array.from({ length: ULTIMA_ETAPA - 1 }, (_, i) => i + 1);

  return (
    <table className="mt-3 text-xs">
      <thead>
        <tr className="text-ter">
          <th className="pb-1 pr-3 text-left font-normal">Cohorte</th>
          {pasos.map((p) => (
            <th key={p} className="px-1 pb-1 text-center font-normal">
              {p}→{p + 1}
            </th>
          ))}
          <th className="pb-1 pl-3 text-right font-normal">n</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.cohorte}>
            <td className="py-0.5 pr-3 text-sec">{f.cohorte}</td>
            {f.pasos.map((p) => (
              <td key={p.desde} className="px-0.5 py-0.5">
                {p.caida === null ? (
                  <div
                    className="h-7 w-11 rounded-sm border border-dashed border-borde"
                    title="Todavía no pasó el tiempo"
                  />
                ) : (
                  <div
                    className="flex h-7 w-11 items-center justify-center rounded-sm"
                    style={{
                      backgroundColor: `color-mix(in srgb, var(--coral) ${Math.round(
                        (Math.min(p.caida, TECHO) / TECHO) * 100,
                      )}%, var(--surface-2))`,
                    }}
                    title={`${f.cohorte} · ${p.desde}ª a ${p.desde + 1}ª`}
                  >
                    {porcentaje(p.caida)}
                  </div>
                )}
              </td>
            ))}
            <td className="py-0.5 pl-3 text-right text-ter">{entero(f.n)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
