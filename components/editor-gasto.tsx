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

  const [abierto, setAbierto] = useState(false);

  // Closed, it is one line: what is being spent per day. That is the only
  // thing worth screen space every time the screen is opened; the six boxes
  // matter on the days something changes.
  return (
    <form
      action={accion}
      className="rounded-lg border border-borde bg-surface px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <button
          type="button"
          onClick={() => setAbierto((a) => !a)}
          className="flex items-center gap-1.5 text-sec hover:text-texto"
        >
          <span
            className={`text-ter transition-transform ${abierto ? "rotate-90" : ""}`}
          >
            ›
          </span>
          <span className="uppercase tracking-wide text-ter">Gasto diario</span>
        </button>

        <span className="tabular-nums text-texto">{usd(total)} por día</span>
        <span className="text-ter">
          AR {usd(totalPais("AR"))} · UY {usd(totalPais("UY"))} ·{" "}
          {usd(total * 30)} al mes
        </span>

        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            className="ml-auto rounded-md border border-borde px-2 py-0.5 text-sec hover:border-sec hover:text-texto"
          >
            Editar
          </button>
        ) : (
          <label className="ml-auto flex items-center gap-2">
            <span className="text-ter">Rige desde</span>
            <input
              type="date"
              name="desde"
              defaultValue={hoy()}
              className="rounded-md border border-borde bg-surface-2 px-2 py-1 text-texto"
            />
          </label>
        )}

        {estado && "ok" in estado && estado.ok ? (
          <span className="text-green">{estado.ok}</span>
        ) : null}
        {estado && "error" in estado && estado.error ? (
          <span className="text-coral">{estado.error}</span>
        ) : null}
      </div>

      {/* The fields stay mounted so what was typed survives a collapse. */}
      <div className={abierto ? "block" : "hidden"}>
        <table className="mt-3 w-full max-w-md text-sm">
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
                        title={
                          desde
                            ? `Vigente desde el ${desde}`
                            : "Sin gasto declarado"
                        }
                        className="w-20 rounded-md border border-borde bg-surface-2 px-2 py-1 text-right tabular-nums text-texto"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 flex flex-wrap items-center gap-3 pb-1">
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md border border-orange bg-orange px-3 py-1 text-xs text-bg disabled:opacity-60"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <span className="text-[11px] text-ter">
            Un cambio no pisa el anterior: guarda una fecha de vigencia, así los
            días ya pasados conservan el gasto que tuvieron.
          </span>
        </div>
      </div>
    </form>
  );
}

/** Today in Montevideo, which is the day the dashboard counts by. */
function hoy(): string {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Montevideo",
  });
}
