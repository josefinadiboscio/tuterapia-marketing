import { nombreDeMes, entero, porcentaje } from "@/lib/ui/format";
import type { Serie, FormatoId } from "@/components/grafico-serie";

/**
 * What the selected month is made of, beside the chart.
 *
 * It replaces the colour legend that used to sit under the bars: same colours,
 * same order as the stack, and it carries the numbers the legend never did.
 *
 * It reads the same `series` the chart draws, so it follows the selected
 * metric and the country selector without being told: whatever the bars are
 * stacked by — platforms with one country chosen, countries on TOTAL — is what
 * the list breaks down.
 */

/** Below this share a platform is not a line of its own. */
const MINIMO = 0.02;

/** With "otras" included, so the list never runs past six. */
const FILAS = 6;

export type FilaComposicion = {
  nombre: string;
  valor: number;
  parte: number;
  /** A Tailwind bg-* class, taken from the bar it describes. */
  color: string;
};

export function Composicion({
  series,
  indice,
  meses,
  formato,
}: {
  series: Serie[];
  indice: number;
  meses: { mes: string; enCurso: boolean }[];
  formato: (n: number | null) => string;
}) {
  const mes = meses[indice];
  if (!mes) return null;

  const filas = componer(series, indice);
  const total = filas.reduce((a, f) => a + f.valor, 0);

  return (
    <aside className="rounded-lg border border-borde bg-surface px-4 py-3 lg:w-[420px] lg:shrink-0">
      <p className="text-xs uppercase tracking-wide text-ter">
        {nombreDeMes(mes.mes)}
        {mes.enCurso ? " · en curso" : ""}
      </p>
      <p className="mt-0.5 text-xl text-texto">{formato(total)}</p>

      <div className="mt-3 space-y-2">
        {filas.map((f) => (
          <div key={f.nombre}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className={`inline-block h-2 w-2 shrink-0 rounded-sm ${f.color}`}
                />
                <span className="truncate text-texto">{f.nombre}</span>
              </span>
              <span className="shrink-0 tabular-nums text-sec">
                {entero(f.valor)}
                <span className="ml-1.5 text-ter">{porcentaje(f.parte, 0)}</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-sm bg-surface-2">
              <div
                className={`h-1.5 rounded-sm ${f.color}`}
                style={{ width: `${Math.max(1, f.parte * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

/**
 * The month's slice of every series, biggest first, with the tail folded in.
 *
 * Two things get folded: anything under two per cent, and whatever is left
 * over once five named rows are taken. A list of eleven platforms where seven
 * of them round to zero is a legend again, not a reading.
 */
export function componer(series: Serie[], indice: number): FilaComposicion[] {
  const crudas = series
    .map((s) => ({
      nombre: s.nombre,
      valor: s.puntos[indice]?.valor ?? 0,
      color: s.relleno.replace("fill-", "bg-"),
    }))
    .filter((f) => f.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  const total = crudas.reduce((a, f) => a + f.valor, 0);
  if (total === 0) return [];

  const nombradas: FilaComposicion[] = [];
  let resto = 0;

  for (const f of crudas) {
    const parte = f.valor / total;
    if (parte >= MINIMO && nombradas.length < FILAS - 1) {
      nombradas.push({ ...f, parte });
    } else {
      resto += f.valor;
    }
  }

  if (resto > 0) {
    nombradas.push({
      nombre: "otras",
      valor: resto,
      parte: resto / total,
      color: "bg-dim",
    });
  }

  return nombradas;
}
