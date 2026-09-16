import { colorPlataforma } from "@/components/identidad";
import { entero, mesCorto } from "@/lib/ui/format";
import type { DiaPlataforma } from "@/lib/diario";

/**
 * Thirty days stacked by platform.
 *
 * The bars are thin because there are thirty of them, and the point is the
 * composition rather than any single day's height. Platforms are ordered by
 * volume so the stack does not reshuffle from one render to the next.
 */
export function GraficoDiario({
  filas,
  plataformas,
}: {
  filas: DiaPlataforma[];
  plataformas: string[];
}) {
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

  return (
    <figure className="mt-3">
      <svg viewBox={`0 0 ${ancho} ${alto + 22}`} className="h-[142px] w-full">
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
                  />
                );
              })}
            </g>
          );
        })}

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
