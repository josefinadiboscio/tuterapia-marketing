import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { TablaEtapas } from "@/components/tabla-etapas";
import { Embudo } from "@/components/embudo";
import { DondeSePierde } from "@/components/donde-se-pierde";
import { GrillaCohortes } from "@/components/grilla-cohortes";
import { SelectorCohorte } from "@/components/selector-cohorte";
import { leerFunnel, PERIODOS, type Periodo } from "@/lib/funnel";
import {
  leerCohortes,
  PROFUNDIDADES,
  type Profundidad,
} from "@/lib/funnel-cohorte";
import { withDb } from "@/lib/db";
import { usuarioActual } from "@/lib/supabase/servidor";
import { entero, porcentaje, delta as fmtDelta } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

/**
 * El funnel, en dos lecturas que no se pisan.
 *
 * Arriba, sobre una ventana móvil de 90/180/365 días: cuánta gente compró y
 * dónde termina la terapia. Es la foto del momento y sirve para comparar
 * contra el período anterior.
 *
 * Abajo, por cohorte: un mes de compradores seguido hacia adelante. Es la
 * misma gente medida con un solo denominador y una sola edad, que es lo único
 * que permite comparar un mes contra otro sin que la diferencia sea el
 * calendario.
 */
export default async function Funnel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const periodo = leerPeriodo(params.periodo);
  const profundidad = leerProfundidad(params.profundidad);

  const [vista, cohortes, puedeExportar] = await Promise.all([
    leerFunnel(ctx.pais, periodo),
    leerCohortes(ctx.pais, profundidad, params.cohorte),
    permisoDeExportar(),
  ]);

  const extra = {
    periodo: String(periodo),
    profundidad: String(profundidad),
    ...(params.cohorte ? { cohorte: params.cohorte } : {}),
  };

  return (
    <>
      <Nav activa="/funnel" ctx={ctx} />
      <Selectores activa="/funnel" ctx={ctx} extra={extra} />

      <main className="contenedor pb-10 pt-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-ter">Período</span>
          {PERIODOS.map((p) => (
            <Link
              key={p}
              href={conContexto("/funnel", ctx, { ...extra, periodo: String(p) })}
              className={`rounded-md border px-2 py-1 ${
                p === periodo
                  ? "border-orange bg-orange text-bg"
                  : "border-borde text-sec hover:text-texto"
              }`}
            >
              {p} días
            </Link>
          ))}
          <span className="ml-1 text-ter">
            {vista.desde} al {vista.hasta}
          </span>
        </div>

        <section className="mt-5 grid gap-[10px] md:grid-cols-2">
          <div className="rounded-lg border border-borde bg-surface px-4 py-3">
            <p className="text-xs text-sec">Compradores del período</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl text-texto">{entero(vista.compradores)}</span>
              {vista.deltaCompradores === null ? null : (
                <span
                  className={`text-xs ${
                    vista.deltaCompradores >= 0 ? "text-green" : "text-ambar"
                  }`}
                >
                  {fmtDelta(vista.deltaCompradores, 0)}
                </span>
              )}
            </p>
          </div>

          <div className="rounded-lg border border-borde bg-surface px-4 py-3">
            <p className="text-xs text-sec">No vuelven tras la 1ª</p>
            {vista.noVuelven === null ? (
              <p className="mt-1 text-2xl text-texto" />
            ) : (
              <>
                <p className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl text-texto">
                    {entero(vista.noVuelven.personas)}
                  </span>
                  <span className="text-sm text-sec">
                    {porcentaje(vista.noVuelven.pct)}
                  </span>
                  {vista.noVuelven.deltaPp === null ? null : (
                    <span
                      className={`text-xs ${
                        vista.noVuelven.deltaPp < 0 ? "text-green" : "text-ambar"
                      }`}
                    >
                      {vista.noVuelven.deltaPp > 0 ? "+" : "−"}
                      {Math.abs(vista.noVuelven.deltaPp * 100).toFixed(1)} pp
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-ter">
                  sobre {entero(vista.noVuelven.base)} compradores, hasta compras
                  del {vista.noVuelven.hasta}
                </p>
              </>
            )}
          </div>
        </section>

        <section className="mt-9">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Por etapa · dónde termina la terapia
          </h2>
          <div className="mt-3">
            <TablaEtapas filas={vista.etapas} />
          </div>
        </section>

        {cohortes.elegida === null ? null : (
          <section className="mt-9">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Cohorte
              </h2>
              <SelectorCohorte
                opciones={cohortes.meses.map((m) => ({
                  mes: m,
                  href: conContexto("/funnel", ctx, { ...extra, cohorte: m }),
                }))}
                elegida={cohortes.elegida.mes}
              />
              <span className="text-[11px] text-ter">
                {entero(cohortes.elegida.n)} compradores ·{" "}
                {cohortes.elegida.diasMadurez} días de madurez
              </span>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start">
              <Embudo cohorte={cohortes.elegida} />
              <DondeSePierde cohorte={cohortes.elegida} />
            </div>
          </section>
        )}

        <section className="mt-9">
          <h2 className="text-xs uppercase tracking-wide text-ter">
            Caída por cohorte
          </h2>
          <div className="mt-3">
            <GrillaCohortes
              grilla={cohortes.grilla}
              profundidad={profundidad}
              cohorteElegida={cohortes.elegida?.mes ?? null}
              pais={ctx.pais}
              puedeExportar={puedeExportar}
              hrefProfundidad={(p) =>
                conContexto("/funnel", ctx, { ...extra, profundidad: String(p) })
              }
              hrefCohorte={(mes) =>
                conContexto("/funnel", ctx, { ...extra, cohorte: mes })
              }
            />
          </div>
        </section>
      </main>
    </>
  );
}

/** Si la cuenta puede bajar datos personales. Sin permiso, la celda no baja. */
async function permisoDeExportar(): Promise<boolean> {
  const usuario = await usuarioActual();
  if (!usuario) return false;
  return withDb(async (db) => {
    const { rows } = await db.query<{ export_pii: boolean }>(
      `select export_pii from marketing.permisos where usuario_id = $1`,
      [usuario.id],
    );
    return rows[0]?.export_pii === true;
  });
}

function leerPeriodo(valor: string | undefined): Periodo {
  const n = Number(valor);
  return PERIODOS.includes(n as Periodo) ? (n as Periodo) : 90;
}

function leerProfundidad(valor: string | undefined): Profundidad {
  const n = Number(valor);
  return PROFUNDIDADES.includes(n as Profundidad) ? (n as Profundidad) : 12;
}
