import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { isCronAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sync job. Triggered by Vercel Cron (see vercel.json) and reachable by hand
 * with the same bearer token. The URL is public, so the token is the only gate.
 *
 * Phase 0: connectivity probe only — counts patient accounts in MySQL.
 * The real aggregation lands in phase 3.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  try {
    const registros = await withMysql(async (conn) => {
      const [rows] = await conn.query<
        (import("mysql2").RowDataPacket & { n: number })[]
      >("SELECT COUNT(*) AS n FROM login WHERE tipo = 1");
      return Number(rows[0]?.n ?? 0);
    });

    return NextResponse.json({
      ok: true,
      registros,
      ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error("[cron/sync] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
        ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}

