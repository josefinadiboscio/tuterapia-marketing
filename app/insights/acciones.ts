"use server";

import { revalidatePath } from "next/cache";
import { withDb } from "@/lib/db";
import { usuarioActual } from "@/lib/supabase/servidor";

/**
 * Descartar un insight.
 *
 * No se borra: se marca. El generador consulta los descartes para no volver a
 * publicar lo mismo por treinta días, así que un descarte borrado sería un
 * insight que reaparece al día siguiente.
 */
export async function accionDescartar(formData: FormData) {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;

  // El middleware ya cubre la pantalla, pero una server action es una URL
  // propia: se chequea de nuevo acá.
  const usuario = await usuarioActual();
  if (!usuario) return;

  await withDb((db) =>
    db.query(
      `update marketing.insights
          set estado = 'descartado', descartado_en = now()
        where id = $1 and estado = 'activo'`,
      [id],
    ),
  );

  revalidatePath("/insights");
}
