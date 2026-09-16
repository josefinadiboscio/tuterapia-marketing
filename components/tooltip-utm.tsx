import { entero, porcentaje } from "@/lib/ui/format";
import type { Punto } from "@/lib/desglose";

/** Beyond this the list stops being readable; the tail goes into one row. */
const VISIBLES = 8;

export type Detalle = {
  titulo: string;
  total: number;
  filas: { clave: string; valor: number; parte: number | null }[];
  otras: { valor: number; parte: number; cuantas: number } | null;
  rate: boolean;
};

/**
 * What one bar is made of, by raw utm_source.
 *
 * The sources are shown exactly as the database holds them — metaarj7,
 * tkarg, gadspre — because that is the string somebody typed into a campaign
 * and the only one they can go and look up. The bars are already grouped by
 * platform; grouping here too would answer the same question twice.
 */
export function detalleDe(
  puntos: Punto[],
  periodo: string,
  titulo: string,
  rate: boolean,
): Detalle | null {
  const delPeriodo = puntos
    .filter((p) => p.periodo === periodo && p.valor > 0)
    .sort((a, b) => b.valor - a.valor);

  if (delPeriodo.length === 0) return null;

  // A rate is never added up, so there is no total to take a share of and no
  // tail to fold into "otras": every row stands on its own.
  if (rate) {
    return {
      titulo,
      total: 0,
      filas: delPeriodo.slice(0, VISIBLES).map((p) => ({
        clave: p.clave,
        valor: p.valor,
        parte: null,
      })),
      otras: null,
      rate,
    };
  }

  const total = delPeriodo.reduce((a, p) => a + p.valor, 0);
  const cabeza = delPeriodo.slice(0, VISIBLES);
  const cola = delPeriodo.slice(VISIBLES);
  const sumaCola = cola.reduce((a, p) => a + p.valor, 0);

  return {
    titulo,
    total,
    filas: cabeza.map((p) => ({
      clave: p.clave,
      valor: p.valor,
      parte: total > 0 ? p.valor / total : null,
    })),
    otras:
      cola.length > 0
        ? { valor: sumaCola, parte: total > 0 ? sumaCola / total : 0, cuantas: cola.length }
        : null,
    rate,
  };
}

export function TooltipUtm({
  detalle,
  estilo,
}: {
  detalle: Detalle;
  estilo: React.CSSProperties;
}) {
  const valor = (v: number) => (detalle.rate ? porcentaje(v) : entero(v));

  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-60 rounded-lg border border-borde bg-surface px-3 py-2 text-xs shadow-lg"
      style={estilo}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sec">{detalle.titulo}</span>
        {detalle.rate ? null : (
          <span className="text-texto">{entero(detalle.total)}</span>
        )}
      </p>

      <ul className="mt-1.5 space-y-0.5">
        {detalle.filas.map((f) => (
          <li key={f.clave} className="flex items-baseline gap-2">
            <span className="flex-1 truncate font-mono text-[11px] text-sec">
              {f.clave}
            </span>
            <span className="tabular-nums text-texto">{valor(f.valor)}</span>
            {f.parte === null ? null : (
              <span className="w-9 text-right tabular-nums text-ter">
                {porcentaje(f.parte)}
              </span>
            )}
          </li>
        ))}

        {detalle.otras ? (
          <li className="flex items-baseline gap-2 border-t border-borde pt-0.5">
            <span className="flex-1 truncate text-ter">
              otras · {detalle.otras.cuantas}
            </span>
            <span className="tabular-nums text-sec">{entero(detalle.otras.valor)}</span>
            <span className="w-9 text-right tabular-nums text-ter">
              {porcentaje(detalle.otras.parte)}
            </span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
