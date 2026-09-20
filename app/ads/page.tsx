import { Nav, Selectores, contexto } from "@/components/nav";
import { TablaAds } from "@/components/tabla-ads";
import { EditorGasto } from "@/components/editor-gasto";
import { leerAds, rangoPorDefecto } from "@/lib/ads";
import { leerGastoVigente } from "./acciones";
import { entero, usd, decimal, multiplo } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Ads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);

  const porDefecto = await rangoPorDefecto();
  const desde = fecha(params.desde) ?? porDefecto.desde;
  const hasta = fecha(params.hasta) ?? porDefecto.hasta;

  const [vista, vigentes] = await Promise.all([
    leerAds(ctx.pais, desde, hasta),
    leerGastoVigente(),
  ]);

  const deltaCac =
    vista.cac !== null && vista.cacPrevio !== null && vista.cacPrevio > 0
      ? vista.cac / vista.cacPrevio - 1
      : null;

  return (
    <>
      <Nav activa="/ads" ctx={ctx} />
      <Selectores activa="/ads" ctx={ctx} extra={{ desde, hasta }} />

      <main className="contenedor pb-8 pt-6">
        {/* The range is a form rather than links: any two dates, not a menu. */}
        <form method="get" className="flex flex-wrap items-end gap-3 text-xs">
          <input type="hidden" name="pais" value={ctx.pais} />
          <label className="flex items-center gap-2">
            <span className="text-ter">Desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              className="rounded-md border border-borde bg-surface px-2 py-1 text-texto"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-ter">Hasta</span>
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              className="rounded-md border border-borde bg-surface px-2 py-1 text-texto"
            />
          </label>
          <button
            type="submit"
            className="rounded-md border border-borde px-2.5 py-1 text-sec hover:border-sec hover:text-texto"
          >
            Aplicar
          </button>
          <span className="text-ter">{vista.dias} días</span>
        </form>

        <div className="mt-4">
          <EditorGasto vigentes={vigentes} />
        </div>

        <section className="mt-5 grid gap-[10px] md:grid-cols-4">
          <Hero
            titulo="Gasto diario"
            valor={usd(vista.gastoDiario, 1)}
            pie={`${usd(vista.gastoTotal)} en el período`}
          />
          <Hero
            titulo="Pacientes diarios"
            valor={decimal(vista.pacientesDiario)}
            pie={`${entero(vista.pacientesTotal)} en el período`}
          />
          <Hero
            titulo="CAC"
            valor={usd(vista.cac, 1)}
            pie={
              deltaCac === null
                ? "sin período anterior"
                : `${deltaCac >= 0 ? "+" : "−"}${Math.abs(deltaCac * 100).toFixed(0)}% vs. período anterior`
            }
            // A CAC going up is bad news, so the arrow reads the other way here.
            tono={
              deltaCac === null ? undefined : deltaCac > 0 ? "coral" : "verde"
            }
          />
          {/* What the day brought in: each new patient at what a patient is
              worth in their country. The footer nets the spend off it, which
              is the number that says whether the day was worth it. */}
          <Hero
            titulo="Retorno diario"
            valor={usd(vista.retornoDiario, 1)}
            // Al lado del número: cuántas veces volvió cada dólar gastado.
            aureola={
              vista.retornoPorDolar === null
                ? undefined
                : {
                    texto: multiplo(vista.retornoPorDolar),
                    titulo:
                      "Por cada dólar gastado. Es el LTV/CAC de toda la cuenta: el numerador cuenta todos los pacientes nuevos del período y el denominador solo el gasto pago, así que es más generoso que el ROAS de cualquier plataforma.",
                    tono: vista.retornoPorDolar >= 1 ? "verde" : "coral",
                  }
            }
            pie={`${usd(vista.netoDiario, 1)} por día neto del gasto`}
            tono={vista.netoDiario >= 0 ? "verde" : "coral"}
          />
        </section>

        <TablaAds filas={vista.filas} />

        {vista.apagadas.length > 0 ? (
          <details className="mt-8">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-ter">
              Apagadas · {vista.apagadas.length}
            </summary>
            <TablaAds filas={vista.apagadas} />
          </details>
        ) : null}
      </main>
    </>
  );
}

function Hero({
  titulo,
  valor,
  pie,
  tono,
  aureola,
}: {
  titulo: string;
  valor: string;
  pie: string;
  tono?: "verde" | "coral";
  /** A second figure beside the number, when one number needs another. */
  aureola?: { texto: string; titulo: string; tono: "verde" | "coral" };
}) {
  const colorDe = (t?: "verde" | "coral") =>
    t === "verde" ? "text-green" : t === "coral" ? "text-coral" : "text-ter";

  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">{titulo}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl text-texto">{valor}</span>
        {aureola ? (
          <span
            title={aureola.titulo}
            className={`cursor-help text-sm ${colorDe(aureola.tono)}`}
          >
            {aureola.texto}
          </span>
        ) : null}
      </p>
      <p className={`mt-0.5 text-xs ${colorDe(tono)}`}>{pie}</p>
    </div>
  );
}

function fecha(valor: string | undefined): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}
