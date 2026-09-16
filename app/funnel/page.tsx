import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { leerFunnel, type Etapa } from "@/lib/funnel";
import { entero, porcentaje, dias, nombreDeMes, SIN_DATO } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Funnel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const vista = await leerFunnel(ctx.pais, params.mes);

  const base = vista.etapas[0]?.valor ?? 0;

  return (
    <>
      <Nav activa="/funnel" ctx={ctx} />
      <Selectores activa="/funnel" ctx={ctx} />

      <main className="mx-auto max-w-5xl px-6 pb-8 pt-6">
        {vista.mes === null ? (
          <p className="text-sm text-sec">
            No hay meses cerrados todavía. Corré el job y volvé.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ter">Cohorte</span>
              {vista.meses.slice(0, 6).map((m) => (
                <Link
                  key={m}
                  href={conContexto("/funnel", ctx, { mes: m })}
                  className={`rounded-md border px-2 py-1 ${
                    m === vista.mes
                      ? "border-orange bg-orange text-bg"
                      : "border-borde text-sec hover:text-texto"
                  }`}
                >
                  {m}
                </Link>
              ))}
            </div>

            <section className="mt-6">
              {vista.etapas.map((etapa, i) => (
                <Paso
                  key={etapa.nombre}
                  etapa={etapa}
                  previa={i > 0 ? vista.etapas[i - 1] : null}
                  base={base}
                />
              ))}
            </section>

            <section className="mt-10 grid gap-[10px] md:grid-cols-4">
              <Card
                titulo="Mediana de compra"
                valor={dias(vista.medianaCompra)}
                segundo={`p80 ${dias(vista.p80Compra)}`}
              />
              <Card titulo="Compran en 24 h" valor={SIN_DATO} />
              <Card titulo="No-show" valor={porcentaje(vista.noShow)} />
              <Card titulo="Caída 1ª → 2ª" valor={SIN_DATO} />
            </section>

            <section className="mt-10">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Caída por cohorte
              </h2>
              <p className="mt-2 border-l-2 border-gold bg-warn-bg px-3 py-2 text-sm">
                La grilla de caída paso a paso necesita el conteo de sesiones
                por paciente, que hoy no se calcula: la tabla de agregados
                guarda cuántos hicieron su primera sesión, no cuántos llegaron a
                la segunda, la tercera ni la cuarta. Es una query nueva sobre
                `sesiones`, no un cambio de pantalla.
              </p>
            </section>
          </>
        )}
      </main>
    </>
  );
}

/**
 * A stage and, above it, the fall from the previous one. The drop goes between
 * the bars rather than inside: it is what the screen is about, not a footnote
 * on the bar.
 */
function Paso({
  etapa,
  previa,
  base,
}: {
  etapa: Etapa;
  previa: Etapa | null;
  base: number;
}) {
  const caida =
    previa?.valor && etapa.valor !== null
      ? { absoluta: previa.valor - etapa.valor, relativa: 1 - etapa.valor / previa.valor }
      : null;

  const ancho = etapa.valor !== null && base > 0 ? (etapa.valor / base) * 100 : 0;

  return (
    <div>
      {previa ? (
        <div className="py-1.5 pl-1 text-xs text-coral">
          {caida ? (
            <>
              −{entero(caida.absoluta)} · {porcentaje(caida.relativa)}
            </>
          ) : (
            <span className="text-ter">sin medir</span>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm text-sec">{etapa.nombre}</span>
        <div className="h-7 flex-1 bg-surface-2">
          {etapa.valor !== null ? (
            <div
              className="h-7 bg-orange"
              style={{ width: `${Math.max(ancho, 0.5)}%` }}
            />
          ) : (
            <div className="h-7 border border-dashed border-borde" />
          )}
        </div>
        <span className="w-28 shrink-0 text-right text-sm">
          {etapa.valor === null ? (
            <span className="text-ter">{etapa.falta ?? SIN_DATO}</span>
          ) : (
            entero(etapa.valor)
          )}
        </span>
      </div>
    </div>
  );
}

function Card({
  titulo,
  valor,
  segundo,
}: {
  titulo: string;
  valor: string;
  segundo?: string;
}) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">{titulo}</p>
      <p className="mt-1 text-2xl text-texto">{valor}</p>
      {segundo ? <p className="mt-0.5 text-xs text-ter">{segundo}</p> : null}
    </div>
  );
}
