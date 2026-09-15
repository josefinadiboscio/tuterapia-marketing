import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { isCronAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Throwaway introspection endpoint for phase 1: lists the columns of the four
 * source tables so the queries can be written against the real schema.
 *
 * Returns column metadata only — never a data row, so no personal data is
 * exposed. Delete this route once the queries are validated against Looker.
 */
const TABLES = ["login", "pacientes", "sesiones", "pacientes_pagos"];

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const schema = await withMysql(async (conn) => {
      const [rows] = await conn.query<
        (import("mysql2").RowDataPacket & {
          TABLE_NAME: string;
          COLUMN_NAME: string;
          COLUMN_TYPE: string;
          IS_NULLABLE: string;
        })[]
      >(
        `SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?)
          ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [process.env.MYSQL_DATABASE, ...TABLES],
      );

      return rows.reduce<Record<string, string[]>>((acc, row) => {
        const column = `${row.COLUMN_NAME} ${row.COLUMN_TYPE}${
          row.IS_NULLABLE === "YES" ? " null" : ""
        }`;
        (acc[row.TABLE_NAME] ??= []).push(column);
        return acc;
      }, {});
    });

    return NextResponse.json({ ok: true, schema });
  } catch (error) {
    console.error("[cron/schema] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
