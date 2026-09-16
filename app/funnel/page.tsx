import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { Embudo } from "@/components/embudo";
import { GrillaCohorte } from "@/components/grilla-cohorte";
import { leerFunnel, lecturaGrilla } from "@/lib/funnel";
import { porcentaje, dias, SIN_DATO } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Funnel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const vista = await leerFunnel(ctx.pais, params.mes);
  const lectura = lecturaGrilla(vista.grilla);

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

            <Embudo etapas={vista.etapas} />

            <section className="mt-10 grid gap-[10px] md:grid-cols-4">
              <Card
                titulo="Mediana de compra"
                valor={dias(vista.medianaCompra)}
                segundo={`p80 ${dias(vista.p80Compra)}`}
              />
              <Card titulo="Compran en 24 h" valor={porcentaje(vista.compranEn24h)} />
              <Card titulo="No-show" valor={porcentaje(vista.noShow)} />
              <Card titulo="Caída 1ª → 2ª" valor={porcentaje(vista.caida1a2)} />
            </section>

            <section className="mt-10">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Caída por cohorte
              </h2>
              <GrillaCohorte filas={vista.grilla} />
              {lectura ? (
                <p className="mt-3 border-l-2 border-gold bg-warn-bg px-3 py-2 text-sm">
                  {lectura}
                </p>
              ) : null}
            </section>
          </>
        )}
      </main>
    </>
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
      <p className="mt-1 text-2xl text-texto">{valor || SIN_DATO}</p>
      {segundo ? <p className="mt-0.5 text-xs text-ter">{segundo}</p> : null}
    </div>
  );
}
