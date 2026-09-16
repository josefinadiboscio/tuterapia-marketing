import { Nav, Selectores, contexto } from "@/components/nav";
import { Pendiente } from "@/components/pendiente";
import { SerieRegistros } from "@/components/serie-registros";
import { leerMovimientos, type Resumen } from "@/lib/movimientos";
import { entero, porcentaje, delta as fmtDelta, fecha } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Movimientos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await contexto(await searchParams);
  const vista = await leerMovimientos(ctx.pais);

  if (!vista.hasta || !vista.actual) {
    return (
      <>
        <Nav activa="/movimientos" ctx={ctx} />
        <Selectores activa="/movimientos" ctx={ctx} />
      <Selectores activa="/movimientos" ctx={ctx} />
        <Pendiente
          titulo="Movimientos"
          contenido={[
            "Resumen de los últimos 7 días contra los 7 anteriores.",
            "Serie diaria de registros de 30 días con media móvil de 7.",
            "Lista por plataforma de los últimos 7 días.",
          ]}
          falta={[
            `No hay datos diarios para ${ctx.pais} todavía.`,
            "Corré el job: sincroniza los últimos 45 días junto con la mensual.",
          ]}
        />
      </>
    );
  }

  const { actual, previo } = vista;
  const totalPlataformas =
    vista.plataformas.reduce((acc, p) => acc + p.registros, 0) || 1;

  return (
    <>
      <Nav activa="/movimientos" ctx={ctx} />
      <Selectores activa="/movimientos" ctx={ctx} />

      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-xs text-sec">
          Últimos 7 días hasta el{" "}
          <span className="tabular-nums">{fecha(vista.hasta)}</span>, contra los
          7 anteriores
        </p>

        <section className="mt-4 grid grid-cols-3 gap-x-8">
          <Metrica
            titulo="Registros"
            valor={entero(actual.registros)}
            delta={variacion(actual, previo, (r) => r.registros)}
            comparativo={entero(previo?.registros)}
          />
          <Metrica
            titulo="Pacientes nuevos"
            valor={entero(actual.pacientes_nuevos)}
            delta={variacion(actual, previo, (r) => r.pacientes_nuevos)}
            comparativo={entero(previo?.pacientes_nuevos)}
          />
          <Metrica
            titulo="Conversión"
            valor={porcentaje(actual.conversion)}
            delta={variacion(actual, previo, (r) => r.conversion)}
            comparativo={porcentaje(previo?.conversion)}

          />
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Registros por día · 30 días
          </h2>
          <SerieRegistros serie={vista.serie} />
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Plataformas · últimos 7 días
          </h2>
          <ul className="mt-3 divide-y divide-borde-suave border-t border-borde">
            {vista.plataformas.map((p) => {
              const d =
                p.previos > 0 ? (p.registros - p.previos) / p.previos : null;
              return (
                <li
                  key={p.plataforma}
                  className="flex items-baseline justify-between py-1.5 text-sm"
                >
                  <span className="text-sec">{p.plataforma}</span>
                  <span className="flex items-baseline gap-6 tabular-nums">
                    <span>{entero(p.registros)}</span>
                    <span className="w-14 text-right text-ter">
                      {porcentaje(p.registros / totalPlataformas)}
                    </span>
                    <span
                      className={`w-24 text-right ${
                        d === null ? "text-ter" : d >= 0 ? "text-forest" : "text-coral"
                      }`}
                    >
                      {d === null ? "—" : `${d >= 0 ? "↑" : "↓"} ${fmtDelta(d)} · ${entero(p.previos)}`}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </>
  );
}

function Metrica({
  titulo,
  valor,
  delta,
  comparativo,
}: {
  titulo: string;
  valor: string;
  delta: number | null;
  comparativo?: string;
}) {
  return (
    <div>
      <p className="text-xs text-ter">{titulo}</p>
      <p className="mt-0.5 text-2xl text-texto">{valor}</p>
      {delta !== null ? (
        <p
          className={`mt-0.5 text-xs ${delta >= 0 ? "text-forest" : "text-coral"}`}
        >
          {delta >= 0 ? "↑" : "↓"} {fmtDelta(delta)}
          {comparativo ? ` · ${comparativo}` : ""}
        </p>
      ) : null}

    </div>
  );
}

function variacion(
  actual: Resumen,
  previo: Resumen | null,
  campo: (r: Resumen) => number | null,
): number | null {
  const a = campo(actual);
  const b = previo && campo(previo);
  if (a === null || b === null || b === undefined || b === 0) return null;
  return (a - b) / b;
}
