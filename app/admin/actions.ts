"use server";

import { revalidatePath } from "next/cache";
import {
  nuevaVigencia,
  guardarGasto,
  guardarPatron,
  borrarPatron,
} from "@/lib/admin";

export async function accionNuevaVigencia(formData: FormData) {
  const clave = String(formData.get("clave"));
  const pais = String(formData.get("pais"));
  const valor = Number(formData.get("valor"));
  const vigenteDesde = String(formData.get("vigente_desde"));

  if (!Number.isFinite(valor) || valor <= 0 || !vigenteDesde) return;

  await nuevaVigencia(clave, pais, valor, vigenteDesde);
  revalidatePath("/admin");
}

export async function accionGuardarGasto(formData: FormData) {
  const mes = String(formData.get("mes"));
  const pais = String(formData.get("pais"));
  const canal = String(formData.get("canal")).trim();
  const monto = Number(formData.get("monto_usd"));

  if (!/^\d{4}-\d{2}$/.test(mes) || !canal || !Number.isFinite(monto)) return;

  await guardarGasto(mes, pais, canal, monto);
  revalidatePath("/admin");
}

export async function accionGuardarPatron(formData: FormData) {
  const patron = String(formData.get("patron")).trim().toLowerCase();
  const plataforma = String(formData.get("plataforma")).trim();
  const superficie = String(formData.get("superficie") ?? "").trim();
  if (!patron || !plataforma) return;

  await guardarPatron({
    patron,
    plataforma,
    superficie: superficie || null,
    es_pago: formData.get("es_pago") === "on",
    orden: Number(formData.get("orden")) || 100,
  });
  revalidatePath("/admin");
}

export async function accionBorrarPatron(formData: FormData) {
  const patron = String(formData.get("patron"));
  if (!patron) return;
  await borrarPatron(patron);
  revalidatePath("/admin");
}
