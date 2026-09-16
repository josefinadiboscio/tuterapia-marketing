import Link from "next/link";
import { cookies } from "next/headers";
import { fechaHora } from "@/lib/ui/format";
import { ToggleTema } from "@/components/tema";
import { RecordarPais } from "@/components/recordar-pais";
import { RANGOS, type Rango } from "@/lib/dashboard";

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
  { href: "/movimientos", nombre: "Movimientos" },
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

export function Nav({
  activa,
  ctx,
  conRango = false,
  extra = {},
  ultimaSync,
}: {
  activa: string;
  ctx: Contexto;
  conRango?: boolean;
  extra?: Record<string, string>;
  ultimaSync?: { corrida_en: string; error: string | null } | null;
}) {
  return (
    <header className="border-b border-borde">
      <RecordarPais pais={ctx.pais} />

      <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 pt-5">
        <h1 className="text-sm font-medium">Tu Terapia · Marketing</h1>
        <div className="flex items-baseline gap-5 text-xs text-ter">
          <span>
            {ultimaSync
              ? `Última sincronización ${fechaHora(ultimaSync.corrida_en)}${
                  ultimaSync.error ? " · terminó con error" : ""
                }`
              : "Sin sincronizaciones"}
          </span>
          <ToggleTema />
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pt-3">
        <nav className="flex gap-5 text-sm">
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
        </nav>

        <div className="flex items-center gap-5 pb-2 text-sm">
          <div className="flex gap-3">
            {PAISES_UI.map((p) => (
              <Link
                key={p}
                href={conContexto(activa, { ...ctx, pais: p }, extra)}
                className={p === ctx.pais ? "text-texto" : "text-ter hover:text-texto"}
              >
                {p}
              </Link>
            ))}
          </div>

          {conRango ? (
            <div className="flex gap-3 border-l border-borde pl-5">
              {RANGOS.map((r) => (
                <Link
                  key={r}
                  href={conContexto(activa, { ...ctx, rango: r }, extra)}
                  className={
                    r === ctx.rango ? "text-texto" : "text-ter hover:text-texto"
                  }
                >
                  {r}m
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
