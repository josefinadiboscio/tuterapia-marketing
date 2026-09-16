import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { TablaAds } from "@/components/tabla-ads";
import { leerAds, MUESTRA_MINIMA, type FilaPlataforma } from "@/lib/ads";
import { veredicto, type Veredicto } from "@/lib/veredicto";
import { entero, usd, porcentaje, fecha, SIN_DATO } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Ads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const vista = await leerAds(ctx.pais, params.semana);

  const filas = vista.filas.map((f) => ({
    ...f,
    veredicto: veredicto({
      ratio: f.ratio,
      registros: f.registros,
      historia: f.historia,
    }),
  }));

  const aRevisar = filas.filter(
    (f) => f.veredicto === "bajar" || f.veredicto === "apagar",
  ).length;

  return (
    <>
      <Nav activa="/ads" ctx={ctx} />
      <Selectores activa="/ads" ctx={ctx} />

      <main className="mx-auto max-w-6xl px-6 pb-8 pt-6">
        {vista.semana === null ? (
          <p className="text-sm text-sec">
            No hay gasto cargado. Importá la planilla con
            scripts/importar-gastos.ts y esta pantalla se llena sola.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ter">Semana</span>
              {vista.semanas.slice(0, 8).map((s) => (
                <Link
                  key={s}
                  href={conContexto("/ads", ctx, { semana: s })}
                  className={`rounded-md border px-2 py-1 ${
                    s === vista.semana
                      ? "border-orange bg-orange text-bg"
                      : "border-borde text-sec hover:text-texto"
                  }`}
                >
                  {fecha(s)}
                </Link>
              ))}
            </div>

            <section className="mt-5 grid gap-[10px] md:grid-cols-4">
              <Resumen titulo="Gasto semanal" valor={usd(vista.totalGasto)} />
              <Resumen
                titulo="Pacientes nuevos"
                valor={entero(vista.totalNuevos)}
              />
              <Resumen titulo="CAC medio" valor={usd(vista.cacMedio, 1)} />
              <Resumen titulo="Plataformas a revisar" valor={entero(aRevisar)} />
            </section>

            <TablaAds filas={filas} />

            <section className="mt-8">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Recomendaciones
              </h2>
              <Recomendaciones filas={filas} />
            </section>
          </>
        )}
      </main>
    </>
  );
}

/**
 * Two kinds of recommendation, because the two levels answer different
 * questions: what to do with the budget, and which campaign is bringing
 * traffic that does not convert.
 *
 * Every line carries the number it rests on. "Bajar Meta" is an instruction;
 * "Meta devuelve 1,12 por dólar" is a reason.
 */
function Recomendaciones({
  filas,
}: {
  filas: (FilaPlataforma & { veredicto: Veredicto })[];
}) {
  const presupuesto = filas
    .filter((f) => f.ratio !== null && f.veredicto !== "sin_dato")
    .map((f) => {
      const ratio = f.ratio!.toFixed(2);
      const donde = `${f.plataforma} · ${f.pais}`;
      if (f.veredicto === "escalar") {
        return `Subir ${donde}: devuelve US$ ${ratio} por dólar, con un CAC de ${usd(f.cac, 1)} contra un LTV de ${usd(f.ratio! * f.cac!, 1)}.`;
      }
      if (f.veredicto === "apagar") {
        return `Apagar ${donde}: lleva tres semanas devolviendo menos de lo que cuesta, hoy US$ ${ratio}.`;
      }
      if (f.veredicto === "bajar") {
        return `Bajar ${donde}: devuelve US$ ${ratio} por dólar, por debajo de 1,30.`;
      }
      return `Mantener ${donde}: US$ ${ratio} por dólar, dentro de la banda.`;
    });

  // A campaign is worth naming when it brings volume that does not convert:
  // the fix is the campaign, not the budget of the whole platform.
  const campanas = filas.flatMap((f) =>
    f.campanas
      .filter((c) => c.alerta)
      .map(
        (c) =>
          `${c.utm_source} trae ${entero(c.registros)} registros en ${f.plataforma} · ${f.pais} y convierte ${porcentaje(c.conversion)}, contra ${porcentaje(f.conversion)} de la plataforma.`,
      ),
  );

  const sinMuestra = filas.filter((f) => f.veredicto === "sin_dato");

  return (
    <>
      {presupuesto.length > 0 ? (
        <>
          <h3 className="mt-3 text-xs text-sec">Presupuesto por plataforma</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm text-sec">
            {presupuesto.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      ) : null}

      {campanas.length > 0 ? (
        <>
          <h3 className="mt-5 text-xs text-sec">Campañas que no convierten</h3>
          <ul className="mt-1.5 space-y-1.5 text-sm text-sec">
            {campanas.map((t) => (
              <li key={t} className="border-l-2 border-coral pl-3">
                {t}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {sinMuestra.length > 0 ? (
        <p className="mt-5 text-xs text-ter">
          Sin veredicto por muestra chica, con menos de {MUESTRA_MINIMA}{" "}
          registros en la semana:{" "}
          {sinMuestra.map((f) => `${f.plataforma} · ${f.pais}`).join(", ")}.
        </p>
      ) : null}

      {presupuesto.length === 0 && campanas.length === 0 ? (
        <p className="mt-2 text-sm text-sec">
          Nada para decidir esta semana: ninguna plataforma llega a la muestra
          mínima de {MUESTRA_MINIMA} registros.
        </p>
      ) : null}
    </>
  );
}

function Resumen({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">{titulo}</p>
      <p className="mt-1 text-2xl text-texto">{valor || SIN_DATO}</p>
    </div>
  );
}
