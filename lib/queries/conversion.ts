import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  monthRangeUtc,
  PRIMERA_SESION,
  PRIMER_PAGO,
  type DiasHistograma,
  type Pais,
} from "./shared";

/**
 * Conversión por cohorte de registro, with a FIXED 30-day window: of the
 * patients who registered in this month, how many had their first realized
 * session within 30 days of registering (METRICAS.md §6).
 *
 * Fixed rather than open-ended so a closed month stops moving. The tail is
 * real — 6% convert after day 60 — which means the number understates
 * conversion slightly and therefore overstates CAC. Erring in that direction
 * is deliberate.
 */
export async function conversionCohorte(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<{ registros: number; convertidos: number }> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { registros: number; convertidos: number })[]
  >(
    `SELECT COUNT(*) AS registros,
            SUM(f.primera IS NOT NULL
                AND f.primera < DATE_ADD(l.creacion, INTERVAL 30 DAY)) AS convertidos
       FROM login l
       LEFT JOIN (${PRIMERA_SESION}) f ON f.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?`,
    [pais, start, end],
  );
  return {
    registros: Number(rows[0]?.registros ?? 0),
    convertidos: Number(rows[0]?.convertidos ?? 0),
  };
}

/**
 * Días entre registro y PRIMER PAGO CONFIRMADO, as a histogram over the
 * registration cohort of the month.
 *
 * On payment, not on first session: "mediana de compra" measures the purchase.
 * The percentile table in METRICAS.md §5 measures registro -> primera sesión,
 * which is a different curve and is what `curvaConversion` below returns.
 *
 * A histogram is the full distribution, so the median and p80 derived from it
 * are exact, and it works the same on MySQL 5.7 and 8.
 */
export async function diasHastaPago(
  conn: Connection,
  mes: string,
  pais: Pais,
): Promise<DiasHistograma> {
  const { start, end } = monthRangeUtc(mes);
  const [rows] = await conn.query<
    (RowDataPacket & { dias: number; n: number })[]
  >(
    `SELECT DATEDIFF(p.primera, l.creacion) AS dias, COUNT(*) AS n
       FROM login l
       JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ? AND l.creacion < ?
      GROUP BY dias
      ORDER BY dias`,
    [pais, start, end],
  );
  return rows.map((r) => ({ dias: Number(r.dias), n: Number(r.n) }));
}

/**
 * Maturity curve for projecting young cohorts: how days-to-first-session are
 * distributed across cohorts old enough to be finished (registered more than
 * 90 days ago).
 *
 * Measured instead of hardcoded. The table in METRICAS.md §5 was a snapshot;
 * this recomputes it from the same data every run, so a shift in the curve
 * shows up instead of quietly biasing the projection.
 */
export async function curvaConversion(
  conn: Connection,
  pais: Pais,
  desde = "2025-01-01",
): Promise<DiasHistograma> {
  const [rows] = await conn.query<
    (RowDataPacket & { dias: number; n: number })[]
  >(
    `SELECT DATEDIFF(f.primera, l.creacion) AS dias, COUNT(*) AS n
       FROM login l
       JOIN (${PRIMERA_SESION}) f ON f.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio = ?
        AND l.creacion >= ?
        AND l.creacion < DATE_SUB(NOW(), INTERVAL 90 DAY)
        AND DATEDIFF(f.primera, l.creacion) >= 0
      GROUP BY dias
      ORDER BY dias`,
    [pais, desde],
  );
  return rows.map((r) => ({ dias: Number(r.dias), n: Number(r.n) }));
}
