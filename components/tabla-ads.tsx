"use client";

import { useActionState, useState } from "react";
import { Chispa } from "@/components/chispa";
import { guardarDescripcion } from "@/app/ads/acciones";
import { entero, usd, porcentaje, SIN_DATO } from "@/lib/ui/format";
import { SEMANAS_DE_TENDENCIA } from "@/lib/umbrales";
import type { Estado, FilaPlataforma, FilaUtm } from "@/lib/ads";

const ETIQUETA: Record<Estado, string> = {
  escalar: "Escalar",
  mantener: "Mantener",
  bajar: "Bajar",
  apagar: "Apagar",
  sin_dato: "Sin dato",
};

const TONO: Record<Estado, string> = {
  escalar: "text-green",
  mantener: "text-sec",
  bajar: "text-coral",
  apagar: "text-coral",
  sin_dato: "text-ter",
};

/** Only Bajar and Apagar tint a row: the row is a decision. */
const FONDO: Record<Estado, string> = {
  escalar: "",
  mantener: "",
  bajar: "bg-danger-bg",
  apagar: "bg-danger-bg",
  sin_dato: "",
};

/**
 * Platforms, each opening onto its campaigns.
 *
 * The platform's CAC is exact: its spend divided by its sales. A campaign's is
 * apportioned — the platform's budget split by share of registrations, because
 * nobody records spend per campaign — so those cells carry a discreet mark and
 * the header says what it means.
 */
export function TablaAds({ filas }: { filas: FilaPlataforma[] }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());

  const alternar = (clave: string) =>
    setAbiertas((previo) => {
      const siguiente = new Set(previo);
      if (siguiente.has(clave)) siguiente.delete(clave);
      else siguiente.add(clave);
      return siguiente;
    });

  if (filas.length === 0) {
    return (
      <p className="mt-6 text-sm text-sec">
        Ninguna plataforma tuvo gasto ni registros en este período.
      </p>
    );
  }

  return (
    /*
     * La tabla se sale 12px de cada lado y las celdas de las puntas los
     * recuperan como padding. Suena al revés y es al revés a propósito: las
     * filas de "Bajar" y "Apagar" llevan un fondo teñido a todo lo ancho, y sin
     * esto la palabra "Bajar" quedaba pegada contra el final del color, igual
     * que el nombre de la plataforma contra el principio. Sangrando la tabla en
     * vez de meter las celdas hacia adentro, el tinte gana aire y las columnas
     * siguen alineadas con las cards de arriba.
     */
    <table className="-mx-3 mt-6 w-[calc(100%+1.5rem)] text-sm">
      <thead>
        <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-ter">
          <th className="pb-2 pl-3 font-normal">Campaña</th>
          <th className="pb-2 text-center font-normal">
            Ventas {SEMANAS_DE_TENDENCIA} sem.
          </th>
          <th className="pb-2 text-right font-normal">Registros</th>
          <th className="pb-2 text-right font-normal">Ventas</th>
          <th className="pb-2 text-right font-normal">Conv.</th>
          <th className="pb-2 text-right font-normal">CAC</th>
          <th className="pb-2 text-right font-normal">ROAS</th>
          <th className="pb-2 pr-3 text-right font-normal">Estado</th>
        </tr>
      </thead>

      {filas.map((f) => {
        const abierta = abiertas.has(f.plataforma);
        return (
          <tbody key={f.plataforma} className="border-b border-borde align-top">
            <tr
              className={`cursor-pointer ${FONDO[f.estado]}`}
              onClick={() => alternar(f.plataforma)}
            >
              <td className="py-2 pl-3">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-ter transition-transform ${abierta ? "rotate-90" : ""}`}
                  >
                    ›
                  </span>
                  <span className="text-texto">{f.plataforma}</span>
                </div>
                <div className="pl-4 text-xs text-ter">
                  {usd(f.gasto)}
                  {f.gastoPropio ? null : " · del presupuesto de Meta"}
                  {/* A day with no row counts as zero. That is right when
                      nothing ran and wrong when somebody forgot, so the count
                      is shown and the judgement stays with whoever reads it. */}
                  {f.diasConGasto < f.diasDelRango ? (
                    <span
                      className="ml-1.5 text-gold"
                      title="Los días sin gasto cargado cuentan como cero, no heredan el día anterior"
                    >
                      · {f.diasConGasto} de {f.diasDelRango} días con gasto
                    </span>
                  ) : null}
                </div>
              </td>
              <td className="py-2 text-center">
                <Chispa valores={f.tendencia} roas={f.tendenciaRoas} />
              </td>
              <td className="py-2 text-right">{entero(f.registros)}</td>
              <td className="py-2 text-right">{entero(f.ventas)}</td>
              <td className="py-2 text-right">{porcentaje(f.conversion)}</td>
              <td className="py-2 text-right">{usd(f.cac, 1)}</td>
              <td className="py-2 text-right">
                {f.roas === null ? SIN_DATO : f.roas.toFixed(2).replace(".", ",")}
              </td>
              <td className={`py-2 pr-3 text-right ${TONO[f.estado]}`}>
                {ETIQUETA[f.estado]}
              </td>
            </tr>

            <tr className={FONDO[f.estado]}>
              <td colSpan={8} className="pb-2 pl-7 pr-3 text-xs text-sec">
                {f.lectura}
              </td>
            </tr>

            {abierta
              ? f.campanas.map((c) => <Campana key={c.utm_source} c={c} />)
              : null}
          </tbody>
        );
      })}
    </table>
  );
}

function Campana({ c }: { c: FilaUtm }) {
  return (
    <>
      <tr className="bg-surface-2/40 text-xs">
        <td className="py-1.5 pl-11">
          <div className="font-mono text-[11px] text-texto">{c.utm_source}</div>
          <Descripcion utm={c.utm_source} valor={c.descripcion} />
        </td>
        <td className="py-1.5 text-center">
          <Chispa valores={c.tendencia} roas={c.tendenciaRoas} />
        </td>
        <td className="py-1.5 text-right text-sec">{entero(c.registros)}</td>
        <td className="py-1.5 text-right text-sec">{entero(c.ventas)}</td>
        <td className="py-1.5 text-right text-sec">{porcentaje(c.conversion)}</td>
        <td className="py-1.5 text-right text-sec">
          {usd(c.cac, 1)}
          {c.cac === null ? null : <Estimado />}
        </td>
        <td className="py-1.5 text-right text-sec">
          {c.roas === null ? SIN_DATO : c.roas.toFixed(2).replace(".", ",")}
          {c.roas === null ? null : <Estimado />}
        </td>
        <td className={`py-1.5 pr-3 text-right ${TONO[c.estado]}`}>
          {ETIQUETA[c.estado]}
        </td>
      </tr>
      <tr className="bg-surface-2/40">
        <td colSpan={8} className="pb-1.5 pl-11 pr-3 text-[11px] text-ter">
          {c.lectura}
        </td>
      </tr>
    </>
  );
}

/** Spend is not recorded per campaign, so a campaign's CAC is apportioned. */
function Estimado() {
  return (
    <span
      className="ml-0.5 cursor-help text-ter"
      title="Estimado: reparte el gasto de la plataforma entre sus campañas según su parte de los registros"
    >
      ~
    </span>
  );
}

function Descripcion({ utm, valor }: { utm: string; valor: string | null }) {
  const [editando, setEditando] = useState(false);
  const [estado, accion, pendiente] = useActionState(guardarDescripcion, null);

  if (!editando) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditando(true);
        }}
        className={`mt-0.5 block text-left text-[11px] ${
          valor ? "text-sec" : "text-ter italic"
        } hover:text-texto`}
      >
        {valor ?? "sin descripción"}
      </button>
    );
  }

  return (
    <form
      action={async (form) => {
        await accion(form);
        setEditando(false);
      }}
      onClick={(e) => e.stopPropagation()}
      className="mt-0.5 flex items-center gap-1"
    >
      <input type="hidden" name="utm_source" value={utm} />
      <input
        name="descripcion"
        defaultValue={valor ?? ""}
        autoFocus
        placeholder="qué es esta campaña"
        className="w-44 rounded border border-borde bg-surface px-1.5 py-0.5 text-[11px] text-texto"
      />
      <button
        type="submit"
        disabled={pendiente}
        className="text-[11px] text-sec hover:text-texto"
      >
        ok
      </button>
      {estado && "error" in estado && estado.error ? (
        <span className="text-[11px] text-coral">{estado.error}</span>
      ) : null}
    </form>
  );
}
