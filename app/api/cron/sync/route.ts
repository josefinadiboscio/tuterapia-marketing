import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import { sincronizarMes, mesesAEscribir } from "@/lib/sync";
import { sincronizarDias, DIAS_A_SINCRONIZAR } from "@/lib/sync-diario";
import { SIN_TERMINAR } from "@/lib/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sync job. Vercel Cron calls it daily at 08:00 UTC — five in the morning
 * in Montevideo, with the day well closed — and the same URL works by hand
 * with the bearer token. The schedule in vercel.json is UTC; Vercel may fire it
 * up to an hour late.
 *
 * Writes the current month and the previous one, and nothing else: a closed
 * month is never recalculated by the cron. A backfill is an explicit command,
 * ?meses=2026-07,2026-06, not a side effect of the schedule.
 *
 * The daily grain is written in the same run, over the last 45 days, so both
 * tables always describe the same moment.
 *
 * The funnel over buyers is NOT written here: it rebuilds a two-year window
 * and this run already uses 55 of its 60 seconds. It has its own endpoint and
 * its own schedule, /api/cron/funnel.
 *
 * Every run writes to marketing.sync_log, success or failure. Without that, a
 * dead cron goes unnoticed for weeks.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const pedido = new URL(request.url).searchParams.get("meses");
  const meses = pedido
    ? pedido.split(",").map((m) => m.trim()).filter((m) => /^\d{4}-\d{2}$/.test(m))
    : mesesAEscribir();

  if (meses.length === 0) {
    return NextResponse.json(
      { error: "invalid ?meses=YYYY-MM,YYYY-MM" },
      { status: 400 },
    );
  }

  const startedAt = Date.now();
  let filas = 0;

  // The row is opened before the work and closed after it. A run killed at the
  // ceiling never reaches any catch — the process is gone — so the only way a
  // timeout leaves a trace is a row that was already there. Today it left
  // none, and the header read the last successful run as if nothing had
  // happened.
  const id = await abrir(meses);

  try {
    await withMysql(async (mysql) => {
      await withDb(async (db) => {
        // The daily grain goes FIRST. This run lives inside a 60-second ceiling
        // and it has already been killed at it: when that happens the work done
        // survives and the rest does not, so the first thing done has to be the
        // one somebody opens the screen for. Yesterday's numbers are that.
        //
        // Skipped on an explicit backfill: those runs are about a past month,
        // and the daily window is always the last 45 days.
        if (!pedido) {
          filas += await sincronizarDias(mysql, db, DIAS_A_SINCRONIZAR);
        }
        for (const mes of meses) {
          filas += await sincronizarMes(mysql, db, mes);
        }
        await cerrar(db, id, filas, Date.now() - startedAt, null);
      });
    });

    return NextResponse.json({
      ok: true,
      meses,
      filas,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : "unknown error";
    console.error("[cron/sync] failed", error);

    // The log matters most when the run failed, so it is written on its own
    // connection — the one that broke may be unusable.
    try {
      await withDb((db) =>
        cerrar(db, id, filas, Date.now() - startedAt, mensaje),
      );
    } catch (logError) {
      console.error("[cron/sync] could not write sync_log", logError);
    }

    return NextResponse.json(
      { ok: false, meses, error: mensaje, ms: Date.now() - startedAt },
      { status: 500 },
    );
  }
}

/** Opens the row. `error` carries SIN_TERMINAR until the run closes it. */
async function abrir(meses: string[]): Promise<number | null> {
  try {
    return await withDb(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into marketing.sync_log (meses, filas, error)
         values ($1, 0, $2)
         returning id::text`,
        [meses, SIN_TERMINAR],
      );
      return Number(rows[0]!.id);
    });
  } catch (error) {
    // A log that cannot be opened must not stop the sync: the numbers matter
    // more than the record of them.
    console.error("[cron/sync] could not open sync_log", error);
    return null;
  }
}

/** Closes it with what happened. Without an id there is nothing to close. */
async function cerrar(
  db: import("pg").Client,
  id: number | null,
  filas: number,
  duracionMs: number,
  error: string | null,
): Promise<void> {
  if (id === null) return;
  await db.query(
    `update marketing.sync_log
        set filas = $2, duracion_ms = $3, error = $4
      where id = $1`,
    [id, filas, duracionMs, error],
  );
}
