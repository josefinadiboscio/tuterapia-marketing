import Link from "next/link";
import { fechaHora } from "@/lib/ui/format";

/**
 * Header shared by every tab: five real routes, not client-side tabs, so each
 * screen is a URL that can be linked and bookmarked.
 *
 * The country and month travel in the query string, so switching tabs keeps
 * what you were looking at. Country never defaults to TOTAL (METRICAS.md §6):
 * activation and currency are different enough that the aggregate is a third
 * option, not the starting point.
 */
export const PESTANAS = [
  { href: "/general", nombre: "General" },
  { href: "/ads", nombre: "Ads" },
  { href: "/funnel", nombre: "Funnel" },
  { href: "/movimientos", nombre: "Movimientos" },
  { href: "/admin", nombre: "Admin" },
] as const;

export const PAISES_UI = ["AR", "UY", "TOTAL"] as const;

export type Contexto = { pais: string; mes?: string };

export function contextoDesde(params: {
  pais?: string;
  mes?: string;
}): Contexto {
  const pais = PAISES_UI.includes(params.pais as never) ? params.pais! : "AR";
  return { pais, mes: params.mes };
}

export function conContexto(href: string, ctx: Contexto): string {
  const query = new URLSearchParams({ pais: ctx.pais });
  if (ctx.mes) query.set("mes", ctx.mes);
  return `${href}?${query}`;
}

export function Nav({
  activa,
  ctx,
  meses = [],
  ultimaSync,
}: {
  activa: string;
  ctx: Contexto;
  meses?: string[];
  ultimaSync?: { corrida_en: string; error: string | null } | null;
}) {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 pt-5">
        <h1 className="text-sm font-medium">Tu Terapia · Marketing</h1>
        <p className="text-xs text-slate-500">
          {ultimaSync
            ? `Última sincronización ${fechaHora(ultimaSync.corrida_en)}${
                ultimaSync.error ? " · terminó con error" : ""
              }`
            : "Sin sincronizaciones"}
        </p>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pb-0 pt-3">
        <nav className="flex gap-5 text-sm">
          {PESTANAS.map((p) => (
            <Link
              key={p.href}
              href={conContexto(p.href, ctx)}
              className={
                p.href === activa
                  ? "-mb-px border-b-2 border-slate-900 pb-2 text-slate-900"
                  : "-mb-px border-b-2 border-transparent pb-2 text-slate-500 hover:text-slate-900"
              }
            >
              {p.nombre}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4 pb-2 text-sm">
          <div className="flex gap-3">
            {PAISES_UI.map((p) => (
              <Link
                key={p}
                href={conContexto(activa, { ...ctx, pais: p })}
                className={
                  p === ctx.pais
                    ? "text-slate-900"
                    : "text-slate-400 hover:text-slate-700"
                }
              >
                {p}
              </Link>
            ))}
          </div>

          {meses.length > 0 ? (
            <form className="flex items-center gap-2">
              <input type="hidden" name="pais" value={ctx.pais} />
              <select
                name="mes"
                defaultValue={ctx.mes ?? meses[0]}
                className="border-b border-slate-300 bg-transparent py-0.5 text-sm tabular-nums outline-none focus:border-slate-900"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-slate-500 hover:text-slate-900">
                Ver
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
