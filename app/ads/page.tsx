import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { leerAds, type FilaAds } from "@/lib/ads";
import {
  veredicto,
  faltanRegistros,
  ETIQUETAS,
  FONDO,
  TONO,
  MUESTRA_MINIMA,
} from "@/lib/veredicto";
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

  const conVeredicto = vista.filas.map((f) => ({
    ...f,
    veredicto: veredicto({
      ratio: f.ratio,
      registros: f.registros,
      historia: f.historia,
    }),
  }));

  const aRevisar = conVeredicto.filter(
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
                valor={SIN_DATO}
                falta="por plataforma"
              />
              <Resumen titulo="CAC medio" valor={SIN_DATO} falta="sin nuevos por plataforma" />
              <Resumen titulo="Campañas a revisar" valor={entero(aRevisar)} />
            </section>

            <table className="mt-8 w-full text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
                  <th className="pb-2 font-normal">Campaña</th>
                  <th className="pb-2 text-right font-normal">Gasto</th>
                  <th className="pb-2 text-right font-normal">Registros</th>
                  <th className="pb-2 text-right font-normal">Conversión</th>
                  <th className="pb-2 text-right font-normal">CAC</th>
                  <th className="pb-2 text-right font-normal">Ratio</th>
                  <th className="pb-2 text-right font-normal">Decisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {conVeredicto.map((f) => (
                  <tr key={`${f.pais}-${f.campana}`} className={FONDO[f.veredicto]}>
                    <td className="py-2">
                      <div>{f.campana}</div>
                      <div className="text-xs text-ter">
                        {f.pais} · {f.plataforma}
                      </div>
                    </td>
                    <td className="py-2 text-right">{usd(f.gasto)}</td>
                    <td className="py-2 text-right">{entero(f.registros)}</td>
                    <td className="py-2 text-right">{porcentaje(f.conversion)}</td>
                    <td className="py-2 text-right">{usd(f.cac, 1)}</td>
                    <td className="py-2 text-right">
                      {f.ratio === null ? SIN_DATO : f.ratio.toFixed(2)}
                    </td>
                    <td className={`py-2 text-right ${TONO[f.veredicto]}`}>
                      {ETIQUETAS[f.veredicto]}
                      {f.veredicto === "sin_dato" && f.registros !== null ? (
                        <div className="text-xs text-ter">
                          faltan {entero(faltanRegistros(f.registros))} registros
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section className="mt-8">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Recomendaciones
              </h2>
              <p className="mt-2 border-l-2 border-gold bg-warn-bg px-3 py-2 text-sm">
                Todas las campañas están en «sin dato»: hace falta el CAC y el
                ratio por campaña para dar un veredicto, y hoy no existen. El
                gasto está cargado por plataforma, no por campaña, y los
                pacientes nuevos por plataforma no se calculan. Con menos de{" "}
                {MUESTRA_MINIMA} registros tampoco se opina.
              </p>
              <ul className="mt-3 space-y-1.5 text-sm text-sec">
                <li>
                  Falta: gasto por campaña, no por canal — hoy la planilla trae
                  Meta, Google Ads y TikTok, sin el `utm_source` de cada
                  campaña.
                </li>
                <li>
                  Falta: pacientes nuevos y conversión por plataforma en el
                  grano diario. Hoy esas filas llevan solo registros.
                </li>
                <li>
                  Falta: LTV por plataforma, que es el numerador del ratio.
                </li>
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Resumen({
  titulo,
  valor,
  falta,
}: {
  titulo: string;
  valor: string;
  falta?: string;
}) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">{titulo}</p>
      <p className="mt-1 text-2xl text-texto">{valor}</p>
      {falta ? <p className="mt-0.5 text-xs text-ter">{falta}</p> : null}
    </div>
  );
}
