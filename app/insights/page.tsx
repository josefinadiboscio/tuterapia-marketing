import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { TarjetaInsight } from "@/components/insight";
import { leerInsights, leerPendientes, type Analisis } from "@/lib/insights";
import { fecha as fmtFecha } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

/**
 * El análisis de la semana.
 *
 * No se pide: se entra y ya está. No hay botón de generar — si hay que apretar
 * algo, no se aprieta, y un análisis a pedido termina siendo un análisis que
 * nadie corre.
 *
 * Un tema principal y dos o tres notas, sobre la semana cerrada anterior. Lee
 * `marketing.insights` y nada más: el trabajo lo hizo otro proceso, el lunes a
 * la mañana, después de la sincronización.
 */
export default async function Insights({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const semanaPedida = /^\d{4}-\d{2}-\d{2}$/.test(params.semana ?? "")
    ? params.semana
    : undefined;

  const [vista, pendientes] = await Promise.all([
    leerInsights(ctx.pais, semanaPedida),
    leerPendientes(),
  ]);

  const { analisis, archivo } = vista;

  return (
    <>
      <Nav activa="/insights" ctx={ctx} />
      <Selectores activa="/insights" ctx={ctx} />

      <main className="contenedor pb-10 pt-6">
        {analisis === null ? (
          <SinAnalisis semana={vista.semanaCorriente} />
        ) : (
          <AnalisisDeLaSemana analisis={analisis} />
        )}

        {archivo.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-xs uppercase tracking-wide text-ter">
              Semanas anteriores
            </h2>
            <ul className="mt-3 divide-y divide-borde border-y border-borde">
              {archivo.map((a) => (
                <li key={a.semana}>
                  <Link
                    href={conContexto("/insights", ctx, { semana: a.semana })}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5 hover:bg-surface"
                  >
                    <span className="w-[130px] shrink-0 text-xs tabular-nums text-ter">
                      {fmtFecha(a.semana)} al {fmtFecha(a.hasta)}
                    </span>
                    <span className="min-w-0 flex-1 text-sm text-texto">
                      {a.titular}
                    </span>
                    <span className="text-[11px] text-ter">
                      {a.piezas} {a.piezas === 1 ? "pieza" : "piezas"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Lo que venía de la pantalla de Admin y no podía desaparecer con
            ella: los valores que se cargan a mano y las cosas que nadie
            mapeó. No se rompen cuando envejecen, se desvían — y una
            desviación sin cartel es la peor clase de error. */}
        <section className="mt-10 border-t border-borde pt-4">
          <h2 className="text-xs uppercase tracking-wide text-ter">Pendientes</h2>

          <div className="mt-3 flex flex-wrap gap-6">
            {pendientes.tipoDeCambio.map((t) => (
              <div key={t.pais}>
                <p className="text-[11px] text-ter">Tipo de cambio {t.pais}</p>
                <p className="flex items-baseline gap-2 text-sm">
                  <span className="tabular-nums text-texto">{t.valor}</span>
                  <span
                    className={`text-[11px] ${
                      t.diasSinTocar >= 30 ? "text-coral" : "text-ter"
                    }`}
                  >
                    {t.diasSinTocar === 0
                      ? "cargado hoy"
                      : `hace ${t.diasSinTocar} día${t.diasSinTocar === 1 ? "" : "s"}`}
                  </span>
                </p>
              </div>
            ))}
          </div>

          <p className="mt-2 text-[11px] text-ter">
            Se cargan a mano. Mientras están viejos, el margen y el LTV en
            dólares se desvían sin avisar.
          </p>

          {pendientes.mesesSinCambio.length > 0 ? (
            <p className="mt-3 border-l-2 border-warn pl-3 text-sm text-texto">
              Falta el tipo de cambio de {pendientes.mesesSinCambio.length} mes
              {pendientes.mesesSinCambio.length === 1 ? "" : "es"} cerrado
              {pendientes.mesesSinCambio.length === 1 ? "" : "s"}:{" "}
              <span className="text-sec">
                {pendientes.mesesSinCambio
                  .slice(0, 6)
                  .map((m) => `${m.mes} ${m.pais}`)
                  .join(" · ")}
              </span>
              . Sin eso el margen y el LTV de esos meses quedan vacíos.
            </p>
          ) : null}

          {pendientes.sinMapear.length > 0 ? (
            <p className="mt-3 border-l-2 border-warn pl-3 text-sm text-texto">
              {pendientes.sinMapear.length} utm_source con volumen y sin mapear:{" "}
              <span className="text-sec">
                {pendientes.sinMapear
                  .map((s) => `${s.utm_source} (${s.registros})`)
                  .join(" · ")}
              </span>
              .
            </p>
          ) : null}
        </section>
      </main>
    </>
  );
}

function AnalisisDeLaSemana({ analisis }: { analisis: Analisis }) {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xs uppercase tracking-wide text-ter">
          Semana del {fmtFecha(analisis.semana)} al {fmtFecha(analisis.hasta)}
        </h1>
        {/* Un análisis viejo tiene que verse viejo. Sin esto, el de hace tres
            semanas pasa por el de esta. */}
        {analisis.semanasAtras > 0 ? (
          <p className="text-[11px] text-coral">
            {analisis.semanasAtras === 1
              ? "Es el de la semana pasada: todavía no se publicó el de esta"
              : `Hace ${analisis.semanasAtras} semanas que no se publica`}
          </p>
        ) : null}
      </div>

      {analisis.tema === null ? null : (
        <section className="mt-3">
          <TarjetaInsight insight={analisis.tema} destacado />
        </section>
      )}

      {analisis.notas.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            También esta semana
          </h2>
          <div className="mt-3 space-y-3">
            {analisis.notas.map((n) => (
              <TarjetaInsight key={n.id} insight={n} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

/**
 * La semana sin novedades.
 *
 * Se dice, no se rellena. Acostumbrar a leer ruido termina en una pestaña que
 * nadie abre, y entonces la semana que sí hay algo tampoco se lee.
 */
function SinAnalisis({ semana }: { semana: string }) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-6">
      <p className="text-sm text-texto">
        Sin movimientos relevantes en la semana del {fmtFecha(semana)}.
      </p>
      <p className="mt-1 text-xs text-ter">
        Todavía no se publicó ningún análisis para este país.
      </p>
    </div>
  );
}
