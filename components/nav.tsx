import Link from "next/link";
import { cookies } from "next/headers";
import { fechaHora } from "@/lib/ui/format";
import { ToggleTema } from "@/components/tema";
import { RecordarPais } from "@/components/recordar-pais";
import {
  RANGOS,
  SIN_TERMINAR,
  leerUltimaSync,
  type Rango,
} from "@/lib/dashboard";
import { identidadDe } from "@/components/identidad";
import { Mascotas } from "@/components/mascotas";

/**
 * Header shared by every tab: five real routes, not client-side tabs, so each
 * screen is a URL that can be linked and bookmarked. Country, month and range
 * ride in the query string and survive a tab change.
 *
 * The country starts on TOTAL and remembers the last choice across visits.
 */
export const PESTANAS = [
  { href: "/general", nombre: "General" },
  { href: "/ads", nombre: "Ads" },
  { href: "/funnel", nombre: "Funnel" },
  { href: "/admin", nombre: "Admin" },
] as const;

export const PAISES_UI = ["TOTAL", "AR", "UY"] as const;

export type Contexto = { pais: string; mes?: string; rango: Rango };

/** The URL wins; then what was chosen last; then TOTAL. */
export async function contexto(params: {
  pais?: string;
  mes?: string;
  rango?: string;
}): Promise<Contexto> {
  const recordado = (await cookies()).get("pais")?.value;
  const candidato = params.pais ?? recordado;
  const pais = PAISES_UI.includes(candidato as never) ? candidato! : "TOTAL";

  const rango = RANGOS.includes(Number(params.rango) as never)
    ? (Number(params.rango) as Rango)
    : 12;

  return { pais, mes: params.mes, rango };
}

export function conContexto(
  href: string,
  ctx: Contexto,
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ pais: ctx.pais, rango: String(ctx.rango) });
  if (ctx.mes) query.set("mes", ctx.mes);
  for (const [clave, valor] of Object.entries(extra)) query.set(clave, valor);
  return `${href}?${query}`;
}

export async function Nav({
  activa,
  ctx,
}: {
  activa: string;
  ctx: Contexto;
}) {
  const ultimaSync = await leerUltimaSync();

  return (
    <header className="border-b border-borde">
      <RecordarPais pais={ctx.pais} />

      {/* The sync stamp sits alone in the top margin: it is a status, not a
          control, and it was competing with the selectors for the same
          corner. */}
      <div className="contenedor flex items-baseline justify-between gap-6 pt-4">
        <h1 className="titulo-app">
          <span className="text-texto">Tu Terapia</span>
          <span className="mx-1.5 text-ter">·</span>
          <span className="text-orange">Marketing Dash</span>
        </h1>
        <div className="flex items-baseline gap-4 text-[11px] text-ter">
          <span>
            {ultimaSync
              ? `Última sincronización ${fechaHora(ultimaSync.corrida_en)}${estado(
                  ultimaSync.error,
                )}`
              : "Sin sincronizaciones"}
          </span>
          <ToggleTema />
        </div>
      </div>

      {/* items-end so the mascots at the end of the row stand on the divider
          rather than floating above it. */}
      <nav className="contenedor flex items-end gap-5 pt-3 text-sm">
        {PESTANAS.map((p) => (
          <Link
            key={p.href}
            href={conContexto(p.href, ctx)}
            className={
              p.href === activa
                ? "-mb-px border-b-2 border-acento pb-2 text-texto"
                : "-mb-px border-b-2 border-transparent pb-2 text-sec hover:text-texto"
            }
          >
            {p.nombre}
          </Link>
        ))}

        <Mascotas />
      </nav>
    </header>
  );
}

/** The selectors open the screen, on their own row under the tabs. */
export function Selectores({
  activa,
  ctx,
  conRango = false,
  extra = {},
}: {
  activa: string;
  ctx: Contexto;
  conRango?: boolean;
  extra?: Record<string, string>;
}) {
  return (
    <div className="contenedor flex flex-wrap items-center gap-3 pt-5">
      <div className="flex items-center overflow-hidden rounded-md border border-borde">
        {PAISES_UI.map((p) => (
          <Link
            key={p}
            href={conContexto(activa, { ...ctx, pais: p }, extra)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs ${
              p === ctx.pais
                ? "bg-surface-2 text-texto"
                : "bg-transparent text-sec hover:text-texto"
            }`}
          >
            {p === ctx.pais ? (
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  identidadDe(p).punto
                }`}
              />
            ) : null}
            {p}
          </Link>
        ))}
      </div>

      {conRango ? (
        <div className="flex items-center overflow-hidden rounded-md border border-borde">
          {RANGOS.map((r) => (
            <Link
              key={r}
              href={conContexto(activa, { ...ctx, rango: r }, extra)}
              className={`px-2.5 py-1 text-xs ${
                r === ctx.rango
                  ? "bg-surface-2 text-texto"
                  : "bg-transparent text-sec hover:text-texto"
              }`}
            >
              {r}m
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * What the last run's error column says about it.
 *
 * The job opens its row before doing the work and closes it after, so a run
 * killed at the sixty-second ceiling — which reaches no catch, because the
 * process is gone — leaves the row open. That is not the same as a run that
 * failed and said so, and the header has to tell them apart: an open row means
 * the numbers under it are half written.
 *
 * A run in flight reads the same way for the minute it lasts. Nobody is
 * looking at five in the morning, and while a sync is still going "no terminó"
 * is simply true.
 */
function estado(error: string | null): string {
  if (error === null) return "";
  if (error === SIN_TERMINAR) return " · no terminó";
  return " · terminó con error";
}
