import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { TablaEtapas } from "@/components/tabla-etapas";
import { TablaTiempos } from "@/components/tabla-tiempos";
import { leerFunnel, PERIODOS, type Periodo } from "@/lib/funnel";
import { entero, porcentaje, delta as fmtDelta } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

/**
 * The funnel over buyers.
 *
 * Two filters and two tables: how many of the people who bought in the period
 * kept sitting down, and how long each step takes. Nothing here is a monthly
 * total; every row is the same group of people followed forward.
 */
export default async function Funnel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const periodo = leerPeriodo(params.periodo);
  const vista = await leerFunnel(ctx.pais, periodo);

  return (
    <>
      <Nav activa="/funnel" ctx={ctx} />
      <Selectores activa="/funnel" ctx={ctx} extra={{ periodo: String(periodo) }} />

      <main className="contenedor pb-10 pt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ter">Período</span>
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={conContexto("/funnel", ctx, { periodo: String(p) })}
              className={`rounded-md border px-2 py-1 ${
                p === periodo
                  ? "border-orange bg-orange text-bg"
                  : "border-borde text-sec hover:text-texto"
              }`}
            >
              {p} días
            </Link>
          ))}
          <span className="ml-1 text-ter">
            {vista.desde} al {vista.hasta}
          </span>
        </div>

        <section className="mt-5 grid gap-[10px] md:grid-cols-2">
          <div className="rounded-lg border border-borde bg-surface px-4 py-3">
            <p className="text-xs text-sec">Compradores del período</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl text-texto">{entero(vista.compradores)}</span>
              {vista.deltaCompradores === null ? null : (
                <span
                  className={`text-xs ${
                    vista.deltaCompradores >= 0 ? "text-green" : "text-ambar"
                  }`}
                >
                  {fmtDelta(vista.deltaCompradores, 0)}
                </span>
              )}
            </p>
          </div>

          <div className="rounded-lg border border-borde bg-surface px-4 py-3">
            <p className="text-xs text-sec">No vuelven tras la 1ª</p>
            {vista.noVuelven === null ? (
              <p className="mt-1 text-2xl text-texto" />
            ) : (
              <>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl text-texto">
                    {entero(vista.noVuelven.personas)}
                  </span>
                  <span className="text-sm text-sec">
                    {porcentaje(vista.noVuelven.pct)}
                  </span>
                  {vista.noVuelven.deltaPp === null ? null : (
                    <span
                      className={`text-xs ${
                        vista.noVuelven.deltaPp < 0 ? "text-green" : "text-ambar"
                      }`}
                    >
                      {vista.noVuelven.deltaPp > 0 ? "+" : "−"}
                      {Math.abs(vista.noVuelven.deltaPp * 100).toFixed(1)} pp
                    </span>
                  )}
                </p>
                {/* The one card allowed a line under the number: without the
                    base and the cut-off date the percentage is unreadable.
                    It is the first-session row of the table, not a second
                    count of the same thing — same base, same cut. */}
                <p className="mt-0.5 text-[11px] text-ter">
                  sobre {entero(vista.noVuelven.base)} compradores, hasta compras
                  del {vista.noVuelven.hasta}
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Por etapa · dónde termina la terapia
          </h2>
          <div className="mt-3">
            <TablaEtapas filas={vista.etapas} />
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Tiempo entre sesiones
          </h2>
          <div className="mt-3">
            <TablaTiempos filas={vista.tiempos} />
          </div>
        </section>

        {vista.lectura ? (
          <p className="mt-6 border-l-2 border-gold bg-warn-bg px-3 py-2 text-sm">
            {vista.lectura}
          </p>
        ) : null}

        {/* The nominal export is per registration cohort, which is a month and
            not this period, so it carries its own selector. */}
        {vista.meses.length > 0 ? (
          <form
            action="/api/funnel/csv"
            method="get"
            className="mt-9 flex flex-wrap items-center gap-2 text-xs"
          >
            <input type="hidden" name="pais" value={ctx.pais} />
            <input type="hidden" name="nominal" value="1" />
            <span className="text-ter">Descargar cohorte</span>
            <select
              name="mes"
              defaultValue={vista.meses[0]}
              className="rounded-md border border-borde bg-surface px-2 py-1 text-texto"
            >
              {vista.meses.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md border border-borde px-2.5 py-1 text-sec hover:border-sec hover:text-texto"
            >
              CSV con nombre y mail
            </button>
          </form>
        ) : null}
      </main>
    </>
  );
}

function leerPeriodo(valor: string | undefined): Periodo {
  const n = Number(valor);
  return PERIODOS.includes(n as Periodo) ? (n as Periodo) : 90;
}
