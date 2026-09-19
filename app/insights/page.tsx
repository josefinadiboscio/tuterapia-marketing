import { Nav, Selectores, contexto } from "@/components/nav";
import { TarjetaInsight } from "@/components/insight";
import { leerInsights, leerPendientes, type Dominio } from "@/lib/insights";
import { fecha as fmtFecha } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

/**
 * El análisis del día.
 *
 * No se pide: se entra y ya está. No hay botón de generar — si hay que
 * apretar algo, no se aprieta, y un análisis a pedido termina siendo un
 * análisis que nadie corre.
 *
 * Lee `marketing.insights` y nada más. El trabajo lo hizo otro proceso, una
 * vez, después de la sincronización.
 */

const TITULO_DOMINIO: Record<Dominio, string> = {
  cruce: "Cruces entre pantallas",
  general: "General",
  ads: "Ads",
  funnel: "Funnel",
};

export default async function Insights({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await contexto(await searchParams);
  const [vista, pendientes] = await Promise.all([
    leerInsights(ctx.pais),
    leerPendientes(),
  ]);

  return (
    <>
      <Nav activa="/insights" ctx={ctx} />
      <Selectores activa="/insights" ctx={ctx} />

      <main className="contenedor pb-10 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-xs uppercase tracking-wide text-ter">
            Lo más importante hoy
          </h1>
          {vista.fecha === null ? null : (
            <p className="text-[11px] text-ter">
              Análisis del {fmtFecha(vista.fecha)}
              {vista.antiguedadDias !== null && vista.antiguedadDias > 1
                ? ` · hace ${vista.antiguedadDias} días`
                : ""}
            </p>
          )}
        </div>

        {vista.total === 0 ? (
          <SinNovedades />
        ) : (
          <>
            <section className="mt-3 space-y-3">
              {vista.destacados.length === 0 ? (
                <p className="text-sm text-ter">
                  Nada se destacó por encima del resto hoy.
                </p>
              ) : (
                vista.destacados.map((i) => (
                  <TarjetaInsight key={i.id} insight={i} destacado />
                ))
              )}
            </section>

            {vista.porDominio.map((grupo) => (
              <section key={grupo.dominio} className="mt-8">
                <h2 className="text-xs uppercase tracking-wide text-ter">
                  {TITULO_DOMINIO[grupo.dominio]}
                </h2>
                <div className="mt-3 space-y-3">
                  {grupo.insights.map((i) => (
                    <TarjetaInsight key={i.id} insight={i} />
                  ))}
                </div>
              </section>
            ))}
          </>
        )}

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

/**
 * El día sin novedades.
 *
 * Se dice, no se rellena. Acostumbrar a leer ruido termina en una pestaña que
 * nadie abre, y entonces el día que sí hay algo tampoco se lee.
 */
function SinNovedades() {
  return (
    <div className="mt-3 rounded-lg border border-borde bg-surface px-4 py-6">
      <p className="text-sm text-texto">
        Sin cambios relevantes desde la última revisión.
      </p>
      <p className="mt-1 text-xs text-ter">
        Todavía no se publicó ningún análisis para este país.
      </p>
    </div>
  );
}
