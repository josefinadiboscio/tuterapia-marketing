"use server";

import { revalidatePath } from "next/cache";
import { withDb } from "@/lib/db";

/**
 * The two things Ads writes.
 *
 * Both are upserts on the primary key, so saving the same day twice lands on
 * the same state. Everything downstream — the period totals, the CAC, the
 * proportional split among campaigns — is summed at read time, so a corrected
 * day changes every number that depends on it with nothing to recompute.
 */

const PAISES = ["AR", "UY"];
const PLATAFORMAS = ["Meta", "Google Ads", "TikTok"];

export async function guardarGasto(_previo: unknown, form: FormData) {
  const pais = String(form.get("pais") ?? "");
  const plataforma = String(form.get("plataforma") ?? "");

  if (!PAISES.includes(pais)) return { error: "País inválido." };
  // Instagram is covered by Meta's budget and never carries its own row.
  if (!PLATAFORMAS.includes(plataforma)) return { error: "Plataforma inválida." };

  // One field per day: monto__2026-09-15.
  const dias: { fecha: string; monto: number }[] = [];
  for (const [clave, valor] of form.entries()) {
    if (!clave.startsWith("monto__")) continue;
    const fecha = clave.slice("monto__".length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;

    const texto = String(valor).trim().replace(",", ".");
    if (texto === "") continue;

    const monto = Number(texto);
    if (!Number.isFinite(monto) || monto < 0) {
      return { error: `Monto inválido en ${fecha}.` };
    }
    dias.push({ fecha, monto });
  }

  if (dias.length === 0) return { error: "No se cargó ningún monto." };

  await withDb(async (db) => {
    for (const d of dias) {
      await db.query(
        `insert into marketing.gastos_diarios (fecha, pais, plataforma, monto_usd)
         values ($1, $2, $3, $4)
         on conflict (fecha, pais, plataforma) do update set
           monto_usd = excluded.monto_usd, actualizado_en = now()`,
        [d.fecha, pais, plataforma, d.monto],
      );
    }
  });

  revalidatePath("/ads");
  return { ok: `${dias.length} días guardados en ${plataforma} · ${pais}.` };
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

/** What is already loaded for a platform and country, to fill the form. */
export async function leerGastoCargado(
  pais: string,
  plataforma: string,
  desde: string,
  hasta: string,
): Promise<Record<string, number>> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ fecha: string; monto_usd: string }>(
      `select fecha::text, monto_usd::text
         from marketing.gastos_diarios
        where pais = $1 and plataforma = $2 and fecha >= $3 and fecha <= $4`,
      [pais, plataforma, desde, hasta],
    );
    return Object.fromEntries(rows.map((r) => [r.fecha, Number(r.monto_usd)]));
  });
}
