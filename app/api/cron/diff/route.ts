import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withMysql } from "@/lib/mysql";
import { isCronAuthorized } from "@/lib/auth";
import { monthRangeUtc } from "@/lib/queries/shared";
import { huellaDePassword } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Counts "pacientes nuevos" under every plausible definition at once, to find
 * which one Looker is using when its number differs from ours.
 *
 * Temporary: delete once the phase 1 numbers are reconciled.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  // ?db=1 reports what the database password looks like, never what it is.
  if (params.get("db") === "1") {
    return NextResponse.json({ ok: true, password: huellaDePassword() });
  }

  const mes = params.get("mes") ?? "2026-08";
  const pais = params.get("pais") ?? "AR";

  const local = monthRangeUtc(mes);
  const [year, month] = mes.split("-").map(Number);
  const utc = {
    start: `${mes}-01 00:00:00`,
    end: `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01 00:00:00`,
  };

  const primeraSesion = (cond: string) => `
    SELECT COUNT(*) AS n FROM (
      SELECT s.id_paciente, MIN(s.fecha) AS primera
        FROM sesiones s JOIN login l ON l.id = s.id_paciente
       WHERE ${cond} AND l.paisDominio = ?
       GROUP BY s.id_paciente
    ) f WHERE f.primera >= ? AND f.primera < ?`;

  const VARIANTES: [string, string, unknown[]][] = [
    // What we compute today.
    ["realizada_local", primeraSesion("s.realizada = 1 AND l.tipo = 1"),
      [pais, local.start, local.end]],
    // Same, with the month cut in UTC instead of local time.
    ["realizada_utc", primeraSesion("s.realizada = 1 AND l.tipo = 1"),
      [pais, utc.start, utc.end]],
    // First session booked, realized or not.
    ["agendada_local", primeraSesion("l.tipo = 1"),
      [pais, local.start, local.end]],
    // Without the tipo = 1 filter.
    ["realizada_sin_filtro_tipo", primeraSesion("s.realizada = 1"),
      [pais, local.start, local.end]],
    // First confirmed payment in the month, not first session.
    ["primer_pago_local", `
      SELECT COUNT(*) AS n FROM (
        SELECT pp.id_paciente, MIN(pp.creacion) AS primera
          FROM pacientes_pagos pp JOIN login l ON l.id = pp.id_paciente
         WHERE pp.confirmado = 1 AND l.tipo = 1 AND l.paisDominio = ?
         GROUP BY pp.id_paciente
      ) f WHERE f.primera >= ? AND f.primera < ?`,
      [pais, local.start, local.end]],
    // Patient profile created in the month.
    ["perfil_creado_local", `
      SELECT COUNT(*) AS n
        FROM pacientes p JOIN login l ON l.id = p.id_login
       WHERE l.tipo = 1 AND l.paisDominio = ?
         AND p.creacion >= ? AND p.creacion < ?`,
      [pais, local.start, local.end]],
    // Country taken from pacientes.pais instead of login.paisDominio.
    ["realizada_pais_de_pacientes", `
      SELECT COUNT(*) AS n FROM (
        SELECT s.id_paciente, MIN(s.fecha) AS primera
          FROM sesiones s
          JOIN login l ON l.id = s.id_paciente
          JOIN pacientes p ON p.id_login = l.id
         WHERE s.realizada = 1 AND l.tipo = 1 AND p.pais = ?
         GROUP BY s.id_paciente
      ) f WHERE f.primera >= ? AND f.primera < ?`,
      ["Argentina", local.start, local.end]],
    // Distinct patients with a realized session in the month whose first ever
    // session is also in the month, counted over sesiones alone.
    ["sesiones_sin_join_login", `
      SELECT COUNT(*) AS n FROM (
        SELECT id_paciente, MIN(fecha) AS primera
          FROM sesiones WHERE realizada = 1 GROUP BY id_paciente
      ) f WHERE f.primera >= ? AND f.primera < ? AND ? = ?`,
      [local.start, local.end, pais, pais]],
  ];

  try {
    const out = await withMysql(async (conn) => {
      const result: Record<string, number> = {};
      for (const [nombre, sql, args] of VARIANTES) {
        const [rows] = await conn.query<(RowDataPacket & { n: number })[]>(
          sql,
          args,
        );
        result[nombre] = Number(rows[0]?.n ?? 0);
      }
      return result;
    });

    return NextResponse.json({ ok: true, mes, pais, variantes: out });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
