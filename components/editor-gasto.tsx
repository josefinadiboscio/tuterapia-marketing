"use client";

import { useActionState, useState } from "react";
import { guardarGasto, type Vigente } from "@/app/ads/acciones";
import { usd } from "@/lib/ui/format";

/**
 * The one place spend is declared.
 *
 * Not a diary: one figure per platform and country says what is being spent
 * per day, and every day from its start date takes it. Change it and every
 * number on the screen changes with it — nothing has to be loaded day by day
 * and no day can be forgotten.
 *
 * Instagram is not offered: Meta's budget pays for it, and a second figure
 * would be counted twice.
 */
const PLATAFORMAS = ["Meta", "Google Ads", "TikTok"];
const PAISES = [
  { codigo: "AR", nombre: "Argentina" },
  { codigo: "UY", nombre: "Uruguay" },
];

export function EditorGasto({ vigentes }: { vigentes: Vigente[] }) {
  const [estado, accion, pendiente] = useActionState(guardarGasto, null);

  const inicial = Object.fromEntries(
    vigentes.map((v) => [
      `${v.pais}|${v.plataforma}`,
      v.monto === null ? "" : String(v.monto),
    ]),
  );
  const [montos, setMontos] = useState<Record<string, string>>(inicial);

  const desdePorClave = new Map(
    vigentes.map((v) => [`${v.pais}|${v.plataforma}`, v.desde]),
  );

  const total = Object.values(montos).reduce((a, t) => {
    const n = Number(String(t).replace(",", "."));
    return a + (Number.isFinite(n) ? n : 0);
  }, 0);

  const totalPais = (pais: string) =>
    PLATAFORMAS.reduce((a, p) => {
      const n = Number(String(montos[`${pais}|${p}`] ?? "").replace(",", "."));
      return a + (Number.isFinite(n) ? n : 0);
    }, 0);

  return (
    <form action={accion} className="rounded-lg border border-borde bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs uppercase tracking-wide text-ter">Gasto diario</h2>
          <p className="mt-0.5 text-xs text-sec">
            Lo que se está poniendo por día, en dólares. Rige hacia adelante
            hasta que lo cambies.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-ter">Rige desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={hoy()}
            className="rounded-md border border-borde bg-surface-2 px-2 py-1 text-texto"
          />
        </label>
      </div>

      <table className="mt-4 w-full max-w-md text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ter">
            <th className="pb-1 text-left font-normal">Plataforma</th>
            {PAISES.map((p) => (
              <th key={p.codigo} className="pb-1 text-right font-normal">
                {p.nombre}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PLATAFORMAS.map((plataforma) => (
            <tr key={plataforma} className="border-t border-borde">
              <td className="py-1.5 text-texto">{plataforma}</td>
              {PAISES.map(({ codigo }) => {
                const clave = `${codigo}|${plataforma}`;
                const desde = desdePorClave.get(clave) ?? null;
                return (
                  <td key={codigo} className="py-1.5 text-right">
                    <span className="mr-1 text-xs text-ter">US$</span>
                    <input
                      name={`monto__${codigo}__${plataforma}`}
                      value={montos[clave] ?? ""}
                      onChange={(e) =>
                        setMontos((m) => ({ ...m, [clave]: e.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="—"
                      title={desde ? `Vigente desde el ${desde}` : "Sin gasto declarado"}
                      className="w-20 rounded-md border border-borde bg-surface-2 px-2 py-1 text-right tabular-nums text-texto"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className="border-t border-borde text-xs text-sec">
            <td className="py-1.5">Por día</td>
            {PAISES.map((p) => (
              <td key={p.codigo} className="py-1.5 text-right tabular-nums">
                {usd(totalPais(p.codigo))}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pendiente}
          className="rounded-md border border-orange bg-orange px-3 py-1 text-xs text-bg disabled:opacity-60"
        >
          {pendiente ? "Guardando…" : "Guardar"}
        </button>
        <span className="text-xs text-ter">
          {usd(total)} por día en total · {usd(total * 30)} al mes
        </span>
        {estado && "ok" in estado && estado.ok ? (
          <span className="text-xs text-green">{estado.ok}</span>
        ) : null}
        {estado && "error" in estado && estado.error ? (
          <span className="text-xs text-coral">{estado.error}</span>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-ter">
        Un cambio no pisa el anterior: guarda una fecha de vigencia, así los
        días ya pasados conservan el gasto que tuvieron.
      </p>
    </form>
  );
}

/** Today in Montevideo, which is the day the dashboard counts by. */
function hoy(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "America/Montevideo" });
}
