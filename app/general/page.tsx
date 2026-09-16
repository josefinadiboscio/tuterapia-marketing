import { Nav, contextoDesde } from "@/components/nav";
import { leerVista, type Metricas } from "@/lib/dashboard";
import { entero, porcentaje, delta as fmtDelta, dias } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function General({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const params = await searchParams;
  const ctx = contextoDesde(params);
  const vista = await leerVista(ctx.pais, ctx.mes);
  const { actual, previo } = vista;

  return (
    <>
      <Nav
        activa="/general"
        ctx={{ ...ctx, mes: actual?.mes ?? ctx.mes }}
        meses={vista.meses}
        ultimaSync={vista.ultimaSync}
      />

      <main className="mx-auto max-w-5xl px-6 py-8">
        {!actual ? (
          <p className="text-sm text-slate-500">
            No hay datos sincronizados para {ctx.pais}. Corré el job y volvé.
          </p>
        ) : (
          <>
            {actual.es_provisorio ? (
              <p className="text-xs text-slate-500">
                Mes en curso · los deltas comparan los primeros{" "}
                <span className="tabular-nums">{actual.tramo_dias ?? 0}</span>{" "}
                días contra el mismo tramo del mes anterior
              </p>
            ) : null}

            <section
              className={`mt-4 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-5 ${
                actual.es_provisorio ? "text-slate-500" : ""
              }`}
            >
              <Metrica
                titulo="Registros"
                valor={entero(actual.registros)}
                delta={calcular(actual, previo, (m) => m.registros, actual.registros_tramo_previo)}
                comparativo={actual.es_provisorio ? actual.registros_tramo_previo : previo?.registros}
              />
              <Metrica
                titulo="Pacientes nuevos"
                valor={entero(actual.pacientes_nuevos)}
                nota="primer pago"
                delta={calcular(actual, previo, (m) => m.pacientes_nuevos, actual.pacientes_nuevos_tramo_previo)}
                comparativo={actual.es_provisorio ? actual.pacientes_nuevos_tramo_previo : previo?.pacientes_nuevos}
              />
              <Metrica
                titulo="Pacientes activos"
                valor={entero(actual.pacientes_activos)}
                nota="con sesión en el mes"
                delta={calcular(actual, previo, (m) => m.pacientes_activos, actual.pacientes_activos_tramo_previo)}
                comparativo={actual.es_provisorio ? actual.pacientes_activos_tramo_previo : previo?.pacientes_activos}
              />
              <Metrica
                titulo="Conversión"
                valor={porcentaje(actual.conversion_cohorte)}
                nota={
                  actual.conversion_proyectada
                    ? `proyectada · cohorte de ${actual.cohorte_edad_dias} días`
                    : "ventana de 30 días"
                }
                proyectada={actual.conversion_proyectada}
                delta={
                  actual.conversion_proyectada || actual.es_provisorio
                    ? null
                    : calcular(actual, previo, (m) => m.conversion_cohorte, null)
                }
                comparativo={null}
              />
              <Metrica
                titulo="Mediana de compra"
                valor={dias(actual.mediana_dias_compra)}
                nota={
                  actual.mediana_dias_compra === null
                    ? `faltan ${30 - (actual.cohorte_edad_dias ?? 0)} días de cohorte`
                    : `p80 ${dias(actual.p80_dias_compra)}`
                }
                delta={null}
                comparativo={null}
              />
            </section>

            {vista.plataformas.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-xs uppercase tracking-wide text-slate-400">
                  Registros por plataforma
                </h2>
                <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-200">
                  {vista.plataformas.map((p) => (
                    <li
                      key={p.plataforma}
                      className="flex items-baseline justify-between py-1.5 text-sm"
                    >
                      <span className="text-slate-700">{p.plataforma}</span>
                      <span className="flex items-baseline gap-6 tabular-nums">
                        <span>{entero(p.registros)}</span>
                        <span className="w-14 text-right text-slate-400">
                          {porcentaje(p.registros / (actual.registros || 1))}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="mt-10 text-xs text-slate-400">
              Gasto, CAC, LTV y churn esperan el gasto mensual y el tipo de
              cambio, que se cargan en Admin.
            </p>
          </>
        )}
      </main>
    </>
  );
}

/**
 * Typography carries the hierarchy: a large figure next to a small grey label
 * says more than a box would (DESIGN.md). The delta always travels with the
 * value it compares against, so the percentage is never alone.
 */
function Metrica({
  titulo,
  valor,
  nota,
  delta,
  comparativo,
  proyectada = false,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  delta: number | null;
  comparativo?: number | null;
  proyectada?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-400">{titulo}</p>
      <p
        className={`mt-0.5 text-2xl tabular-nums ${
          proyectada ? "text-amber-700" : "text-slate-900"
        }`}
      >
        {valor}
      </p>
      {delta !== null ? (
        <p
          className={`mt-0.5 text-xs tabular-nums ${
            delta >= 0 ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {fmtDelta(delta)}
          {comparativo !== null && comparativo !== undefined
            ? ` · ${entero(comparativo)}`
            : ""}
        </p>
      ) : null}
      {nota ? <p className="mt-0.5 text-xs text-slate-400">{nota}</p> : null}
    </div>
  );
}

function calcular(
  actual: Metricas,
  previo: Metricas | null,
  campo: (m: Metricas) => number | null,
  tramoPrevio: number | null,
): number | null {
  const a = campo(actual);
  if (a === null) return null;
  const b = actual.es_provisorio ? tramoPrevio : previo && campo(previo);
  if (b === null || b === undefined || b === 0) return null;
  return (a - b) / b;
}
