import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import { rellenarUtm, rangoEntre } from "@/lib/sync-utm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Rellena hacia atrás el tráfico por campaña.
 *
 * El sync nocturno escribe una ventana de 45 días, así que
 * `marketing.metricas_utm` arrancó el 3 de agosto de 2026 —45 días antes de su
 * primera corrida— y nunca iba a tener nada anterior. El gasto llega hasta
 * diciembre de 2025, así que cualquier rango de Ads más largo que eso dividía
 * todo el gasto por una parte de los pacientes.
 *
 * No va en `vercel.json`: es una operación de una sola vez, no un horario. Se
 * llama a mano con el bearer, una vez por tramo, hasta que contesta
 * `{ listo: true }`.
 *
 * Cada llamada busca sola el tramo que falta —el que termina un día antes del
 * primer día que ya existe— así que no hay que llevar la cuenta de dónde iba:
 * se la llama de nuevo y sigue. Es upsert sobre la clave primaria, así que
 * repetir un tramo deja exactamente lo mismo.
 *
 *   ?dias=30           el tamaño del tramo (por defecto 30)
 *   ?piso=2025-12-01   hasta dónde vale la pena ir hacia atrás
 *
 * El piso por defecto es diciembre de 2025, que es donde arranca
 * `marketing.metricas_utm_mensual` — más atrás no hay con qué comparar.
 */
const PISO_POR_DEFECTO = "2025-12-01";
const DIAS_POR_TRAMO = 30;

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const piso = fecha(params.get("piso")) ?? PISO_POR_DEFECTO;
  const dias = Math.max(1, Math.min(90, Number(params.get("dias")) || DIAS_POR_TRAMO));

  const primero = await withDb(async (db) => {
    const { rows } = await db.query<{ min: string | null }>(
      "select min(fecha)::text as min from marketing.metricas_utm",
    );
    return rows[0]?.min ?? null;
  });

  // Sin una sola fila no hay desde dónde ir hacia atrás. Es un caso que no
  // debería pasar —el sync corre todas las noches— y contestar algo claro es
  // mejor que rellenar un rango inventado.
  if (primero === null) {
    return NextResponse.json(
      { error: "marketing.metricas_utm está vacía; corré /api/cron/sync primero" },
      { status: 409 },
    );
  }

  if (primero <= piso) {
    return NextResponse.json({ listo: true, cubre_desde: primero, piso });
  }

  const hasta = sumarDias(primero, -1);
  const desde = maximo(piso, sumarDias(hasta, -(dias - 1)));

  const inicio = Date.now();
  const filas = await withMysql((mysql) =>
    withDb((db) => rellenarUtm(mysql, db, rangoEntre(desde, hasta))),
  );

  const cubreDesde = await withDb(async (db) => {
    const { rows } = await db.query<{ min: string }>(
      "select min(fecha)::text as min from marketing.metricas_utm",
    );
    return rows[0]?.min ?? desde;
  });

  return NextResponse.json({
    listo: cubreDesde <= piso,
    tramo: { desde, hasta },
    filas,
    cubre_desde: cubreDesde,
    piso,
    ms: Date.now() - inicio,
  });
}

function fecha(valor: string | null): string | null {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null;
}

function sumarDias(dia: string, dias: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function maximo(a: string, b: string): string {
  return a > b ? a : b;
}
