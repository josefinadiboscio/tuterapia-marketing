import { leerVista, type Metricas } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

const PAISES = ["AR", "UY", "TOTAL"];

export default async function General({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const { pais = "AR", mes } = await searchParams;
  const vista = await leerVista(PAISES.includes(pais) ? pais : "AR", mes);
  const { actual, previo } = vista;

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-semibold">Tu Terapia · Marketing</h1>
          <p className="mt-1 text-sm text-slate-500">
            {vista.ultimaSync
              ? `Última sincronización: ${formatearFecha(vista.ultimaSync.corrida_en)}${
                  vista.ultimaSync.error ? " · con error" : ""
                }`
              : "Sin sincronizaciones todavía"}
          </p>
        </div>

        <div className="flex gap-2">
          <nav className="flex rounded-md border border-slate-300 p-0.5">
            {PAISES.map((p) => (
              <a
                key={p}
                href={`?pais=${p}${actual ? `&mes=${actual.mes}` : ""}`}
                className={`rounded px-3 py-1 text-sm ${
                  p === pais
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {p}
              </a>
            ))}
          </nav>

          {vista.meses.length > 0 && actual ? (
            // A plain GET form: the page is a Server Component, so changing
            // the month is a navigation, not client state.
            <form className="flex gap-2">
              <input type="hidden" name="pais" value={pais} />
              <select
                name="mes"
                defaultValue={actual.mes}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                {vista.meses.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-100"
              >
                Ver
              </button>
            </form>
          ) : null}
        </div>
      </header>

      {!actual ? (
        <p className="mt-10 text-sm text-slate-500">
          Todavía no hay datos sincronizados para {pais}. Corré el job y volvé.
        </p>
      ) : (
        <>
          {actual.es_provisorio ? (
            <p className="mt-5 inline-block rounded-md bg-amber-50 px-3 py-1 text-sm text-amber-900">
              Mes en curso · provisorio, sin comparación contra el mes anterior
            </p>
          ) : null}

          <section className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <Tarjeta
              titulo="Registros"
              valor={formatearEntero(actual.registros)}
              delta={delta(actual, previo, (m) => m.registros)}
            />
            <Tarjeta
              titulo="Pacientes nuevos"
              valor={formatearEntero(actual.pacientes_nuevos)}
              nota="primer pago confirmado"
              delta={delta(actual, previo, (m) => m.pacientes_nuevos)}
            />
            <Tarjeta
              titulo="Pacientes activos"
              valor={formatearEntero(actual.pacientes_activos)}
              nota="con sesión en el mes"
              delta={delta(actual, previo, (m) => m.pacientes_activos)}
            />
            <Tarjeta
              titulo="Conversión"
              valor={formatearPorcentaje(actual.conversion_cohorte)}
              nota={
                actual.conversion_proyectada
                  ? `proyectada · cohorte de ${actual.cohorte_edad_dias} días`
                  : "ventana de 30 días"
              }
              delta={
                actual.conversion_proyectada
                  ? null
                  : delta(actual, previo, (m) => m.conversion_cohorte)
              }
            />
            <Tarjeta
              titulo="Mediana de compra"
              valor={formatearDias(actual.mediana_dias_compra)}
              nota={`p80 ${formatearDias(actual.p80_dias_compra)}`}
              delta={null}
            />
          </section>

          {vista.plataformas.length > 0 ? (
            <section className="mt-10">
              <h2 className="text-sm font-medium text-slate-900">
                Registros por plataforma
              </h2>
              <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-200">
                {vista.plataformas.map((p) => (
                  <li
                    key={p.plataforma}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="text-slate-700">{p.plataforma}</span>
                    <span className="flex items-baseline gap-3">
                      <span className="tabular-nums text-slate-900">
                        {formatearEntero(p.registros)}
                      </span>
                      <span className="w-12 text-right tabular-nums text-slate-400">
                        {formatearPorcentaje(
                          p.registros / (actual.registros || 1),
                        )}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="mt-10 text-xs text-slate-400">
            Gasto, CAC, LTV y churn esperan los parámetros de Admin: el tipo de
            cambio del mes y el gasto en USD.
          </p>
        </>
      )}
    </main>
  );
}

function Tarjeta({
  titulo,
  valor,
  nota,
  delta,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  delta: number | null;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      {delta !== null ? (
        <p
          className={`mt-1 text-xs tabular-nums ${
            delta >= 0 ? "text-emerald-600" : "text-red-600"
          }`}
        >
          {delta >= 0 ? "+" : ""}
          {(delta * 100).toFixed(1)}% vs mes anterior
        </p>
      ) : null}
      {nota ? <p className="mt-1 text-xs text-slate-400">{nota}</p> : null}
    </div>
  );
}

/** No delta for a month still running: half a month against a whole one paints everything red. */
function delta(
  actual: Metricas,
  previo: Metricas | null,
  campo: (m: Metricas) => number | null,
): number | null {
  if (actual.es_provisorio || !previo) return null;
  const a = campo(actual);
  const b = campo(previo);
  if (a === null || b === null || b === 0) return null;
  return (a - b) / b;
}

function formatearEntero(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("es-AR");
}

function formatearPorcentaje(n: number | null): string {
  return n === null ? "—" : `${(n * 100).toFixed(1)}%`;
}

function formatearDias(n: number | null): string {
  return n === null ? "—" : `${n} d`;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}
