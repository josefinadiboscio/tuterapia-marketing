import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import { sincronizarFunnel, DIAS_DE_FUNNEL } from "@/lib/sync-funnel";
import { sincronizarTerapeuta } from "@/lib/sync-terapeuta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The funnel aggregates, on their own schedule.
 *
 * Separate from /api/cron/sync because that one already uses 55 of its 60
 * seconds, and because the two answer to different rules: the monthly grain
 * writes the current month and the previous one, this rebuilds a moving window
 * of two years. A cohort of buyers keeps moving forever (METRICAS.md §8), so
 * there is nothing to freeze.
 *
 * `?dias=` narrows the window when a full rebuild does not fit — the recent
 * days are the ones that move most — and `?offset=` shifts it back, so a long
 * window can be rebuilt in pieces:
 *   ?dias=760&offset=380  →  the older half
 *   ?dias=380             →  the recent half
 *
 * De paso escribe `eligieron_terapeuta`, que obedece a la misma regla: no es
 * un hecho del mes sino un estado de hoy, así que tampoco se congela. Vive acá
 * y no en /api/cron/sync porque ese job muere a los 60 segundos sin llegar al
 * mes anterior, que es justo el que esta métrica necesita releer. Son dos
 * consultas agrupadas y este job cierra en cuatro segundos.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const dias = entero(params.get("dias"), DIAS_DE_FUNNEL);
  const offset = entero(params.get("offset"), 0);

  const startedAt = Date.now();

  try {
    const { filas, terapeuta } = await withMysql((mysql) =>
      withDb(async (db) => ({
        filas: await sincronizarFunnel(mysql, db, dias, offset),
        terapeuta: await sincronizarTerapeuta(mysql, db),
      })),
    );

    await withDb((db) =>
      db.query(
        `insert into marketing.sync_log (duracion_ms, meses, filas, error)
         values ($1, $2, $3, null)`,
        [Date.now() - startedAt, [`funnel:${dias}d+${offset}`], filas],
      ),
    );

    return NextResponse.json({
      ok: true,
      dias,
      offset,
      filas,
      terapeuta,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "unknown error";
    console.error("[cron/funnel] failed", error);

    try {
      await withDb((db) =>
        db.query(
          `insert into marketing.sync_log (duracion_ms, meses, filas, error)
           values ($1, $2, 0, $3)`,
          [Date.now() - startedAt, [`funnel:${dias}d+${offset}`], mensaje],
        ),
      );
    } catch (logError) {
      console.error("[cron/funnel] could not write sync_log", logError);
    }

    return NextResponse.json(
      { ok: false, dias, offset, error: mensaje, ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}

/** Number(null) is 0, and 0 is a valid day count, so absent is checked first. */
function entero(valor: string | null, porDefecto: number): number {
  if (valor === null || valor.trim() === "") return porDefecto;
  const n = Number(valor);
  return Number.isInteger(n) && n >= 0 ? n : porDefecto;
}
