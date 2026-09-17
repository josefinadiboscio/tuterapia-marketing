import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import { sincronizarMes, mesesAEscribir } from "@/lib/sync";
import { sincronizarDias, DIAS_A_SINCRONIZAR } from "@/lib/sync-diario";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The sync job. Vercel Cron calls it daily (see vercel.json); the same URL
 * works by hand with the bearer token.
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

  try {
    await withMysql(async (mysql) => {
      await withDb(async (db) => {
        for (const mes of meses) {
          filas += await sincronizarMes(mysql, db, mes);
        }
        // Skipped on an explicit backfill: those runs are about a past month,
        // and the daily window is always the last 45 days.
        if (!pedido) {
          filas += await sincronizarDias(mysql, db, DIAS_A_SINCRONIZAR);
        }
        await registrar(db, meses, filas, Date.now() - startedAt, null);
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
        registrar(db, meses, filas, Date.now() - startedAt, mensaje),
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

async function registrar(
  db: import("pg").Client,
  meses: string[],
  filas: number,
  duracionMs: number,
  error: string | null,
): Promise<void> {
  await db.query(
    `insert into marketing.sync_log (duracion_ms, meses, filas, error)
     values ($1, $2, $3, $4)`,
    [duracionMs, meses, filas, error],
  );
}
