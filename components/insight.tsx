import Link from "next/link";
import { accionDescartar } from "@/app/insights/acciones";
import type { Insight, Severidad } from "@/lib/insights";

/**
 * Un insight.
 *
 * La estructura no es decorativa: el hallazgo y la recomendación están
 * separados a propósito, con la recomendación en su propio bloque y su propio
 * encabezado. Uno tiene que poder aceptar el dato y rechazar la sugerencia sin
 * descartar las dos cosas.
 *
 * La severidad vive en el borde izquierdo y en ningún otro lado. Pintar el
 * fondo entero de coral convierte una observación en una alarma.
 */
const BORDE: Record<Severidad, string> = {
  alerta: "border-l-coral",
  oportunidad: "border-l-green",
  observacion: "border-l-borde",
};

const ETIQUETA: Record<Severidad, string> = {
  alerta: "Alerta",
  oportunidad: "Oportunidad",
  observacion: "Observación",
};

const TONO: Record<Severidad, string> = {
  alerta: "text-coral",
  oportunidad: "text-green",
  observacion: "text-ter",
};

export function TarjetaInsight({
  insight,
  destacado = false,
}: {
  insight: Insight;
  destacado?: boolean;
}) {
  return (
    <article
      className={`border-l-2 ${BORDE[insight.severidad]} rounded-r-lg border-y border-r border-borde bg-surface px-4 py-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-wide">
            <span className={TONO[insight.severidad]}>
              {ETIQUETA[insight.severidad]}
            </span>
            {/* Cuando un hallazgo vuelve es porque empeoró, y decirlo cambia
                cómo se lee: no es lo mismo verlo por primera vez que verlo
                otra vez y peor. */}
            {insight.agravadoDe === null ? null : (
              <span className="rounded-sm bg-warn-bg px-1.5 py-0.5 text-warn">
                agravado
              </span>
            )}
          </p>
          <h3
            className={`mt-1 text-texto ${destacado ? "text-lg" : "text-base"}`}
          >
            {insight.titular}
          </h3>
        </div>

        <form action={accionDescartar} className="shrink-0">
          <input type="hidden" name="id" value={insight.id} />
          <button
            type="submit"
            className="text-[11px] text-ter hover:text-texto"
            title="No volver a mostrar este hallazgo"
          >
            descartar
          </button>
        </form>
      </div>

      <p className="mt-1.5 text-sm text-sec">{insight.cuerpo}</p>

      {insight.datos.length > 0 ? (
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {insight.datos.map((d) => (
            <div key={d.etiqueta}>
              <dt className="text-[11px] text-ter" title={`de ${d.fuente}`}>
                {d.etiqueta}
              </dt>
              <dd className="flex items-baseline gap-1.5 text-sm tabular-nums">
                {d.antes === null ? null : (
                  <>
                    <span className="text-ter">{d.antes}</span>
                    <span className="text-ter">→</span>
                  </>
                )}
                <span className="text-texto">{d.ahora}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {insight.recomendacion === null ? null : (
        <div className="mt-3 rounded-md bg-surface-2 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-ter">
            Recomendación
          </p>
          <p className="mt-0.5 text-sm text-texto">{insight.recomendacion}</p>
        </div>
      )}

      {insight.enlaces.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-3">
          {insight.enlaces.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className="text-xs text-sec underline decoration-borde underline-offset-2 hover:text-texto"
            >
              {e.texto}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
