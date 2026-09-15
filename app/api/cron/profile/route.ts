import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withMysql } from "@/lib/mysql";
import { isCronAuthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Data profiling for phase 1. Answers the factual questions left open by
 * METRICAS.md (which values actually exist, how many rows fall in each edge
 * case) so the remaining questions are business decisions, not guesses.
 *
 * Aggregates only, and never a personal column: no nombre, apellido,
 * telefono, email or fecha_nacimiento is read, not even to count duplicates.
 *
 * Temporary: delete once the queries are validated against Looker.
 */
const PROBES: Record<string, string> = {
  // Does terminarRegistro = 0 mean "no therapist yet"? Decides how the funnel
  // stage is modelled, and the user's recollection points the other way.
  terapeuta_vs_registro: `
    SELECT p.terminarRegistro, COUNT(*) AS n,
           SUM(p.id_terapeuta IS NULL) AS sin_terapeuta,
           SUM(p.id_terapeuta IS NOT NULL) AS con_terapeuta
      FROM pacientes p JOIN login l ON l.id = p.id_login
     WHERE l.tipo = 1 GROUP BY p.terminarRegistro`,

  // MySQL 8 has window functions, 5.7 does not. Decides how percentiles run.
  version: `SELECT VERSION() AS version`,

  // Which account types exist, and whether `active` should filter registros.
  login_tipo_active: `
    SELECT tipo, active, COUNT(*) AS n
      FROM login GROUP BY tipo, active ORDER BY tipo, active`,

  // Countries present. paisDominio is NOT NULL, but may hold '' or others.
  login_pais: `
    SELECT COALESCE(NULLIF(paisDominio, ''), '(vacio)') AS pais, COUNT(*) AS n
      FROM login WHERE tipo = 1 GROUP BY 1 ORDER BY n DESC`,

  // Month boundaries depend on how creacion is stored.
  timezone: `
    SELECT @@global.time_zone AS global_tz, @@session.time_zone AS session_tz,
           NOW() AS db_now, UTC_TIMESTAMP() AS db_utc,
           MIN(creacion) AS primer_registro, MAX(creacion) AS ultimo_registro
      FROM login WHERE tipo = 1`,

  // Registros with no patient profile, and profiles left half-finished.
  login_sin_paciente: `
    SELECT COUNT(*) AS logins_tipo1,
           SUM(p.id_login IS NULL) AS sin_fila_en_pacientes,
           SUM(p.terminarRegistro = 0) AS registro_sin_terminar,
           SUM(p.etiquetas IS NOT NULL AND p.etiquetas <> '') AS con_etiquetas
      FROM login l LEFT JOIN pacientes p ON p.id_login = l.id
     WHERE l.tipo = 1`,

  // Which `realizada` values exist, and whether future dates are marked done.
  sesiones_estado: `
    SELECT realizada, COUNT(*) AS n,
           SUM(fecha > NOW()) AS con_fecha_futura,
           SUM(id_pago IS NULL) AS sin_pago_asociado,
           MIN(fecha) AS primera, MAX(fecha) AS ultima
      FROM sesiones GROUP BY realizada ORDER BY realizada`,

  // Edge cases that break the margin formula.
  pagos_estado: `
    SELECT confirmado, COUNT(*) AS n,
           SUM(monto = 0) AS monto_cero,
           SUM(sesiones = 0 OR sesiones IS NULL) AS sesiones_cero,
           SUM(moneda IS NULL) AS sin_moneda,
           SUM(usadas > sesiones) AS usadas_mayor_que_compradas
      FROM pacientes_pagos GROUP BY confirmado ORDER BY confirmado`,

  // pacientes_pagos has its own paisDominio. Does it match the login's?
  pagos_pais_vs_login: `
    SELECT pp.paisDominio AS pais_pago, l.paisDominio AS pais_login, COUNT(*) AS n
      FROM pacientes_pagos pp JOIN login l ON l.id = pp.id_paciente
     WHERE pp.confirmado = 1 GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`,

  // Sanity check for METRICAS.md §9: does precio x pct land near 6 / 10 USD?
  precio_sesion: `
    SELECT paisDominio AS pais, moneda, COUNT(*) AS n,
           ROUND(AVG(monto / sesiones)) AS precio_promedio,
           ROUND(MIN(monto / sesiones)) AS precio_min,
           ROUND(MAX(monto / sesiones)) AS precio_max
      FROM pacientes_pagos
     WHERE confirmado = 1 AND monto > 0 AND sesiones > 0
       AND creacion >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY 1, 2 ORDER BY n DESC`,

  // Raw utm_source values, to check the mapping patterns cover the volume.
  utm_sources: `
    SELECT COALESCE(NULLIF(utm_source, ''), '(sin utm)') AS utm_source,
           paisDominio AS pais, COUNT(*) AS n
      FROM login
     WHERE tipo = 1 AND creacion >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
     GROUP BY 1, 2 ORDER BY n DESC LIMIT 60`,
};

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await withMysql(async (conn) => {
      const out: Record<string, unknown> = {};
      for (const [name, sql] of Object.entries(PROBES)) {
        const [rows] = await conn.query<RowDataPacket[]>(sql);
        out[name] = rows;
      }
      return out;
    });

    return NextResponse.json({ ok: true, profile: result });
  } catch (error) {
    console.error("[cron/profile] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
      },
      { status: 500 },
    );
  }
}
