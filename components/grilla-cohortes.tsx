import Link from "next/link";
import { entero, porcentaje } from "@/lib/ui/format";
import { ETIQUETA_TRAMO } from "@/lib/funnel";
import { PROFUNDIDADES, type Cohorte, type Profundidad } from "@/lib/funnel-cohorte";

/**
 * La caída de todas las cohortes, una fila por mes.
 *
 * Cada celda es el porcentaje que NO pasa al tramo siguiente, y la intensidad
 * del color es esa misma caída, normalizada contra la peor celda de la grilla.
 * Normalizar contra la peor y no contra 100% es lo que hace que la grilla se
 * lea: las caídas reales viven entre 5% y 35%, y sobre una escala a 100 todas
 * quedarían del mismo rosa pálido.
 *
 * También es navegación: la etiqueta de la fila cambia el embudo de arriba.
 * Mirar la grilla y querer ver ese mes en detalle es el movimiento natural, y
 * sin esto habría que volver al desplegable y buscarlo.
 *
 * Las celdas de tramos que todavía no ocurrieron van punteadas y vacías. Un
 * cero ahí sería mentira —no es que no cayó nadie, es que no pasó el tiempo—
 * y por eso tampoco se pueden descargar.
 */
export function GrillaCohortes({
  grilla,
  profundidad,
  cohorteElegida,
  pais,
  puedeExportar,
  hrefProfundidad,
  hrefCohorte,
}: {
  grilla: Cohorte[];
  profundidad: Profundidad;
  cohorteElegida: string | null;
  pais: string;
  /** Sin el rol export_pii la celda muestra el número y no descarga. */
  puedeExportar: boolean;
  hrefProfundidad: (p: Profundidad) => string;
  hrefCohorte: (mes: string) => string;
}) {
  const peor = Math.max(
    0,
    ...grilla.flatMap((c) =>
      c.tramos.map((t) => t.pctCaida ?? 0),
    ),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="text-ter">Profundidad</span>
          {PROFUNDIDADES.map((p) => (
            <Link
              key={p}
              href={hrefProfundidad(p)}
              className={`rounded-md border px-2 py-1 ${
                p === profundidad
                  ? "border-orange bg-orange text-bg"
                  : "border-borde text-sec hover:text-texto"
              }`}
            >
              {p} meses
            </Link>
          ))}
        </div>
        <p className="text-[11px] text-ter">
          {puedeExportar
            ? "Clic en una celda para bajar el CSV de esa gente."
            : "Sin permiso de exportación: las celdas no descargan."}
        </p>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-borde text-xs uppercase tracking-wide text-ter">
              <th className="pb-2 text-left font-normal">Cohorte</th>
              {ETIQUETA_TRAMO.map((e) => (
                <th key={e} className="pb-2 text-center font-normal">
                  {e.replace("Compra", "C")}
                </th>
              ))}
              <th className="pb-2 text-right font-normal">
                <span title="Compradores de la cohorte">n</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {grilla.map((c) => (
              <tr key={c.mes} className="border-b border-borde">
                <td className="py-1.5">
                  <Link
                    href={hrefCohorte(c.mes)}
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      c.mes === cohorteElegida
                        ? "bg-surface-2 text-texto"
                        : "text-sec hover:text-texto"
                    }`}
                  >
                    {c.mes}
                  </Link>
                </td>

                {c.tramos.map((t) => (
                  <td key={t.tramo} className="p-0.5">
                    <Celda
                      pct={t.pctCaida}
                      perdidos={t.perdidos}
                      peor={peor}
                      href={
                        puedeExportar && t.perdidos !== null
                          ? `/api/funnel/csv?pais=${pais}&cohorte=${c.mes}&tramo=${t.tramo}`
                          : null
                      }
                    />
                  </td>
                ))}

                <td className="py-1.5 text-right text-xs tabular-nums text-ter">
                  {entero(c.n)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Celda({
  pct,
  perdidos,
  peor,
  href,
}: {
  pct: number | null;
  perdidos: number | null;
  peor: number;
  href: string | null;
}) {
  if (pct === null) {
    return (
      <div className="h-8 rounded-sm border border-dashed border-borde" />
    );
  }

  const intensidad = peor > 0 ? pct / peor : 0;
  const fondo = `color-mix(in srgb, var(--coral) ${(8 + intensidad * 62).toFixed(0)}%, transparent)`;

  const contenido = (
    <>
      <span className="tabular-nums">{porcentaje(pct, 0)}</span>
      {href ? (
        // La flecha vive en la celda y se enciende al pasar el mouse: si
        // estuviera siempre visible, seis por fila, la grilla sería una
        // grilla de flechas.
        <svg
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-70"
          aria-hidden="true"
        >
          <path
            d="M6 1v7m0 0L3.5 5.5M6 8l2.5-2.5M2 10.5h8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      ) : null}
    </>
  );

  if (!href) {
    return (
      <div
        className="flex h-8 items-center justify-center gap-1 rounded-sm text-xs text-texto"
        style={{ background: fondo }}
        title={perdidos === null ? undefined : `${entero(perdidos)} personas`}
      >
        {contenido}
      </div>
    );
  }

  return (
    <a
      href={href}
      className="group flex h-8 items-center justify-center gap-1 rounded-sm text-xs text-texto ring-inset hover:ring-2 hover:ring-coral"
      style={{ background: fondo }}
      title={`Bajar las ${entero(perdidos ?? 0)} personas que cayeron acá`}
    >
      {contenido}
    </a>
  );
}
