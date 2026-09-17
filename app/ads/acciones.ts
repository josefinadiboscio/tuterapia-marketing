"use server";

import { revalidatePath } from "next/cache";
import { withDb } from "@/lib/db";

/**
 * The two things Ads writes.
 *
 * Spend is a rate, not a diary: one figure per platform and country says what
 * is being spent per day, and every day from its start date takes it. Changing
 * it changes every day it covers, and nothing has to be recomputed because the
 * totals are summed at read time.
 *
 * A new figure inserts a new row rather than overwriting the previous one, so
 * a past period keeps the rate it actually had — the same vigencia rule as
 * marketing.parametros.
 */

const PAISES = ["AR", "UY"];
/** Instagram is covered by Meta's budget and never carries its own figure. */
const PLATAFORMAS = ["Meta", "Google Ads", "TikTok"];

export type Vigente = {
  pais: string;
  plataforma: string;
  monto: number | null;
  desde: string | null;
};

export async function guardarGasto(_previo: unknown, form: FormData) {
  const desde = String(form.get("desde") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return { error: "Fecha inválida." };

  // One field per country and platform: monto__AR__Meta.
  const filas: { pais: string; plataforma: string; monto: number }[] = [];
  for (const pais of PAISES) {
    for (const plataforma of PLATAFORMAS) {
      const bruto = form.get(`monto__${pais}__${plataforma}`);
      if (bruto === null) continue;

      const texto = String(bruto).trim().replace(",", ".");
      if (texto === "") continue;

      const monto = Number(texto);
      if (!Number.isFinite(monto) || monto < 0) {
        return { error: `Monto inválido en ${plataforma} · ${pais}.` };
      }
      filas.push({ pais, plataforma, monto });
    }
  }

  if (filas.length === 0) return { error: "No se cargó ningún monto." };

  await withDb(async (db) => {
    for (const f of filas) {
      await db.query(
        `insert into marketing.gasto_vigente
           (pais, plataforma, monto_usd, vigente_desde)
         values ($1, $2, $3, $4)
         on conflict (pais, plataforma, vigente_desde) do update set
           monto_usd = excluded.monto_usd, cargado_en = now()`,
        [f.pais, f.plataforma, f.monto, desde],
      );
    }
  });

  revalidatePath("/ads");
  return { ok: `Guardado. Rige desde el ${desde}.` };
}

export async function guardarDescripcion(_previo: unknown, form: FormData) {
  const utm = String(form.get("utm_source") ?? "").trim();
  const descripcion = String(form.get("descripcion") ?? "").trim();
  if (utm === "") return { error: "Falta la campaña." };

  await withDb(async (db) => {
    if (descripcion === "") {
      await db.query("delete from marketing.utm_descripcion where utm_source = $1", [
        utm,
      ]);
      return;
    }
    await db.query(
      `insert into marketing.utm_descripcion (utm_source, descripcion)
       values ($1, $2)
       on conflict (utm_source) do update set
         descripcion = excluded.descripcion, actualizado_en = now()`,
      [utm, descripcion],
    );
  });

  revalidatePath("/ads");
  return { ok: "Guardado." };
}

/** The figure in force today for each platform and country, to fill the form. */
export async function leerGastoVigente(): Promise<Vigente[]> {
  return withDb(async (db) => {
    const { rows } = await db.query<{
      pais: string;
      plataforma: string;
      monto_usd: string;
      vigente_desde: string;
    }>(
      `select distinct on (pais, plataforma)
              pais, plataforma, monto_usd::text, vigente_desde::text
         from marketing.gasto_vigente
        where vigente_desde <= current_date
        order by pais, plataforma, vigente_desde desc`,
    );

    const porClave = new Map(rows.map((r) => [`${r.pais}|${r.plataforma}`, r]));

    return PAISES.flatMap((pais) =>
      PLATAFORMAS.map((plataforma) => {
        const r = porClave.get(`${pais}|${plataforma}`);
        return {
          pais,
          plataforma,
          monto: r ? Number(r.monto_usd) : null,
          desde: r?.vigente_desde ?? null,
        };
      }),
    );
  });
}
