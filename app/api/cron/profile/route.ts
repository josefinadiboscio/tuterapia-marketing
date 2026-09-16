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

  // The margin reads US$5 a session in AR and US$11 in UY, against a list
  // price the user puts near US$17 and US$28. A miss of the same size in two
  // countries with different prices and different commissions is not two
  // coincidences, so this reproduces precioPorSesion's own arithmetic split by
  // currency: whichever currency carries the weight is the one distorting it.
  margen_por_moneda: `
    SELECT l.paisDominio AS pais, pp.moneda,
           COUNT(*) AS pagos,
           SUM(pp.sesiones) AS sesiones,
           ROUND(SUM(pp.monto)) AS monto_total,
           ROUND(SUM(pp.monto) / SUM(pp.sesiones), 2) AS precio_sesion,
           ROUND(AVG(pp.sesiones), 2) AS paquete_promedio,
           ROUND(MIN(pp.monto / pp.sesiones), 2) AS min_unit,
           ROUND(MAX(pp.monto / pp.sesiones), 2) AS max_unit
      FROM pacientes_pagos pp
      JOIN login l ON l.id = pp.id_paciente AND l.tipo = 1
     WHERE pp.confirmado = 1 AND pp.monto > 0 AND pp.sesiones > 0
       AND l.paisDominio IN ('AR', 'UY')
       AND pp.creacion >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
     GROUP BY 1, 2 ORDER BY 1, 2`,

  // Same window, bucketed by unit price, to see whether one cheap cluster is
  // dragging the weighted average or the whole distribution sits low.
  margen_distribucion: `
    SELECT l.paisDominio AS pais, pp.moneda,
           CASE
             WHEN pp.monto / pp.sesiones < 1000 THEN 'a <1k'
             WHEN pp.monto / pp.sesiones < 5000 THEN 'b 1k-5k'
             WHEN pp.monto / pp.sesiones < 15000 THEN 'c 5k-15k'
             WHEN pp.monto / pp.sesiones < 30000 THEN 'd 15k-30k'
             ELSE 'e 30k+'
           END AS rango_unitario,
           COUNT(*) AS pagos, SUM(pp.sesiones) AS sesiones
      FROM pacientes_pagos pp
      JOIN login l ON l.id = pp.id_paciente AND l.tipo = 1
     WHERE pp.confirmado = 1 AND pp.monto > 0 AND pp.sesiones > 0
       AND l.paisDominio IN ('AR', 'UY')
       AND pp.creacion >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
     GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,

  // pacientes_pagos has its own paisDominio. Does it match the login's?
  pagos_pais_vs_login: `
    SELECT pp.paisDominio AS pais_pago, l.paisDominio AS pais_login, COUNT(*) AS n
      FROM pacientes_pagos pp JOIN login l ON l.id = pp.id_paciente
     WHERE pp.confirmado = 1 GROUP BY 1, 2 ORDER BY n DESC LIMIT 20`,

  // Is monto/sesiones the list price, or does a bigger package cost less per
  // session? The reference prices sit above every observed value, which is
  // what a volume discount looks like from the outside.
  precio_por_tamano_paquete: `
    SELECT paisDominio AS pais,
           COALESCE(tipo_session, '(sin dato)') AS tipo_session,
           sesiones AS tamano_paquete,
           COUNT(*) AS pagos,
           ROUND(AVG(monto)) AS monto_promedio,
           ROUND(AVG(monto / sesiones)) AS precio_sesion,
           ROUND(MAX(monto / sesiones)) AS precio_sesion_max
      FROM pacientes_pagos
     WHERE confirmado = 1 AND monto > 0 AND sesiones > 0
       AND moneda = '$' AND paisDominio IN ('AR', 'UY')
       AND creacion >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY 1, 2, 3 ORDER BY pais, tipo_session, tamano_paquete`,

  // When did the price last move? A rise days old would not show up in a
  // six-month average, nor in its maximum if nobody has paid it yet.
  precio_por_mes: `
    SELECT DATE_FORMAT(DATE_SUB(creacion, INTERVAL 3 HOUR), '%Y-%m') AS mes,
           paisDominio AS pais,
           COALESCE(tipo_session, '(sin dato)') AS tipo_session,
           COUNT(*) AS pagos,
           ROUND(MAX(monto / sesiones)) AS precio_max,
           ROUND(SUM(monto) / SUM(sesiones)) AS precio_promedio
      FROM pacientes_pagos
     WHERE confirmado = 1 AND monto > 0 AND sesiones > 0
       AND moneda = '$' AND paisDominio IN ('AR', 'UY')
       AND creacion >= DATE_SUB(CURDATE(), INTERVAL 5 MONTH)
     GROUP BY 1, 2, 3 ORDER BY mes DESC, pais, tipo_session`,

  // pacientes_pagos.tipo is still undocumented (METRICAS.md §9).
  tipos_de_pago: `
    SELECT COALESCE(tipo, -1) AS tipo, COUNT(*) AS pagos,
           ROUND(AVG(monto / sesiones)) AS precio_sesion,
           ROUND(AVG(sesiones), 2) AS sesiones_promedio
      FROM pacientes_pagos
     WHERE confirmado = 1 AND monto > 0 AND sesiones > 0
       AND creacion >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY 1 ORDER BY pagos DESC`,

  // Price per session split by tipo_session: online and presencial are not
  // the same product and the margin follows the price.
  precio_por_tipo_session: `
    SELECT paisDominio AS pais, moneda,
           COALESCE(tipo_session, '(sin dato)') AS tipo_session,
           COUNT(*) AS pagos,
           SUM(sesiones) AS sesiones,
           ROUND(SUM(monto) / SUM(sesiones)) AS precio_sesion,
           ROUND(MIN(monto / sesiones)) AS precio_min,
           ROUND(MAX(monto / sesiones)) AS precio_max
      FROM pacientes_pagos
     WHERE confirmado = 1 AND monto > 0 AND sesiones > 0
       AND creacion >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
     GROUP BY 1, 2, 3 ORDER BY pagos DESC`,

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

  // ?only=a,b runs just those probes. Running all of them returns more than
  // fits in a log when the question is about two of them.
  const only = new URL(request.url).searchParams.get("only");
  const pedidas = only
    ? only.split(",").map((n) => n.trim()).filter((n) => n in PROBES)
    : Object.keys(PROBES);

  try {
    const result = await withMysql(async (conn) => {
      const out: Record<string, unknown> = {};
      for (const name of pedidas) {
        const sql = PROBES[name]!;
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
