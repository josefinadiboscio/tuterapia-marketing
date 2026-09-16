import { Nav, contextoDesde } from "@/components/nav";
import { Pendiente } from "@/components/pendiente";
import { SerieRegistros } from "@/components/serie-registros";
import { leerMovimientos, type Resumen } from "@/lib/movimientos";
import { entero, porcentaje, delta as fmtDelta, fecha } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

export default async function Movimientos({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const ctx = contextoDesde(await searchParams);
  const vista = await leerMovimientos(ctx.pais);

  if (!vista.hasta || !vista.actual) {
    return (
      <>
        <Nav activa="/movimientos" ctx={ctx} />
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

      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-xs text-slate-500">
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
            proyectada={actual.conversion_proyectada}
            nota={
              actual.conversion_proyectada
                ? "proyectada · cohortes de menos de 30 días"
                : undefined
            }
          />
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-slate-400">
            Registros por día · 30 días
          </h2>
          <SerieRegistros serie={vista.serie} />
        </section>

        <section className="mt-10">
          <h2 className="text-xs uppercase tracking-wide text-slate-400">
            Plataformas · últimos 7 días
          </h2>
          <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-200">
            {vista.plataformas.map((p) => {
              const d =
                p.previos > 0 ? (p.registros - p.previos) / p.previos : null;
              return (
                <li
                  key={p.plataforma}
                  className="flex items-baseline justify-between py-1.5 text-sm"
                >
                  <span className="text-slate-700">{p.plataforma}</span>
                  <span className="flex items-baseline gap-6 tabular-nums">
                    <span>{entero(p.registros)}</span>
                    <span className="w-14 text-right text-slate-400">
                      {porcentaje(p.registros / totalPlataformas)}
                    </span>
                    <span
                      className={`w-24 text-right ${
                        d === null
                          ? "text-slate-300"
                          : d >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                      }`}
                    >
                      {d === null ? "—" : `${fmtDelta(d)} · ${entero(p.previos)}`}
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
  nota,
  delta,
  comparativo,
  proyectada = false,
}: {
  titulo: string;
  valor: string;
  nota?: string;
  delta: number | null;
  comparativo?: string;
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
          {comparativo ? ` · ${comparativo}` : ""}
        </p>
      ) : null}
      {nota ? <p className="mt-0.5 text-xs text-amber-700">{nota}</p> : null}
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
