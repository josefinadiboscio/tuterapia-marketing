"use client";

import { useActionState, useState } from "react";
import { guardarGasto } from "@/app/ads/acciones";
import { usd } from "@/lib/ui/format";

/**
 * Loading spend, day by day.
 *
 * One field per day of the range, prefilled with whatever is already stored, so
 * the form is a correction rather than a re-entry. Instagram is not offered:
 * Meta's budget covers it and a separate Instagram figure would be counted
 * twice.
 */
const PLATAFORMAS = ["Meta", "Google Ads", "TikTok"];
const PAISES = ["AR", "UY"];

export function EditorGasto({
  desde,
  hasta,
  cargado,
}: {
  desde: string;
  hasta: string;
  /** "AR|Meta|2026-09-15" → amount, for everything already stored. */
  cargado: Record<string, number>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pais, setPais] = useState(PAISES[0]!);
  const [plataforma, setPlataforma] = useState(PLATAFORMAS[0]!);
  const [estado, accion, pendiente] = useActionState(guardarGasto, null);

  const dias = diasDelRango(desde, hasta);

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-md border border-borde px-2.5 py-1 text-xs text-sec hover:border-sec hover:text-texto"
      >
        Editar gasto
      </button>
    );
  }

  return (
    <div className="mt-3 w-full rounded-lg border border-borde bg-surface p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wide text-ter">Cargar gasto</h3>
        <button
          type="button"
          onClick={() => setAbierto(false)}
          className="text-xs text-sec hover:text-texto"
        >
          Cerrar
        </button>
      </div>

      <form action={accion} className="mt-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <label className="flex items-center gap-2">
            <span className="text-sec">País</span>
            <select
              name="pais"
              value={pais}
              onChange={(e) => setPais(e.target.value)}
              className="rounded-md border border-borde bg-surface-2 px-2 py-1 text-texto"
            >
              {PAISES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2">
            <span className="text-sec">Plataforma</span>
            <select
              name="plataforma"
              value={plataforma}
              onChange={(e) => setPlataforma(e.target.value)}
              className="rounded-md border border-borde bg-surface-2 px-2 py-1 text-texto"
            >
              {PLATAFORMAS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <span className="text-ter">
            Instagram no se carga: lo cubre el presupuesto de Meta.
          </span>
        </div>

        <div className="mt-4 grid max-h-72 grid-cols-2 gap-x-6 gap-y-1 overflow-y-auto md:grid-cols-3">
          {dias.map((fecha) => {
            const previo = cargado[`${pais}|${plataforma}|${fecha}`];
            return (
              <label key={fecha} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 tabular-nums text-ter">{fecha}</span>
                <input
                  // The key forces a fresh field when the platform or country
                  // changes, so the box shows that combination's own value.
                  key={`${pais}|${plataforma}|${fecha}`}
                  name={`monto__${fecha}`}
                  defaultValue={previo === undefined ? "" : String(previo.toFixed(2))}
                  inputMode="decimal"
                  placeholder="—"
                  className="w-20 rounded-md border border-borde bg-surface-2 px-2 py-1 text-right tabular-nums text-texto"
                />
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pendiente}
            className="rounded-md border border-orange bg-orange px-3 py-1 text-xs text-bg disabled:opacity-60"
          >
            {pendiente ? "Guardando…" : "Guardar"}
          </button>
          <span className="text-xs text-ter">
            Total cargado en pantalla: {usd(totalVisible(cargado, pais, plataforma, dias))}
          </span>
          {estado && "ok" in estado && estado.ok ? (
            <span className="text-xs text-forest">{estado.ok}</span>
          ) : null}
          {estado && "error" in estado && estado.error ? (
            <span className="text-xs text-coral">{estado.error}</span>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function totalVisible(
  cargado: Record<string, number>,
  pais: string,
  plataforma: string,
  dias: string[],
): number {
  return dias.reduce((a, f) => a + (cargado[`${pais}|${plataforma}|${f}`] ?? 0), 0);
}

function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let t = Date.parse(`${desde}T00:00:00Z`);
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  // A guard rather than a limit: a range of years would render thousands of
  // inputs and freeze the page.
  while (t <= fin && out.length < 120) {
    out.push(new Date(t).toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}
