import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  LOCAL_UTC_OFFSET_HOURS,
  PRIMER_PAGO,
  PRIMERA_SESION,
  diasLocales,
} from "@/lib/queries/shared";

/**
 * The funnel, measured over buyers, with the day of the purchase as the cohort.
 *
 * Every row comes out of MySQL already grouped: the job never pulls a patient.
 * The day grain is what lets the screen ask "the last 90 days" and still cut
 * each stage at its own maturity date, which lands on an arbitrary day.
 *
 * Sessions are counted over the patient's whole life, not inside a window —
 * the same rule as the monthly cohort. A window would put a clock on the
 * stages that the purchase above them does not have, and the sixth session
 * would come out smaller than it is for reasons of arithmetic.
 */

/** Local calendar day of the purchase, which is the cohort key. */
const DIA_DE_COMPRA = `DATE(DATE_SUB(p.primera, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR))`;

/** The last session the stage table needs; two more than the screen draws. */
export const ULTIMA_SESION = 12;

/** Trips between stages: 0 is purchase to first session, 5 is fifth to sixth. */
export const ULTIMO_TRAMO = 5;

export type EtapaPorDia = {
  fecha: string;
  pais: string;
  nro_sesion: number;
  pacientes: number;
};

export type TiempoPorDia = {
  fecha: string;
  pais: string;
  tramo: number;
  dias: number;
  pacientes: number;
};

/**
 * Buyers per day and how far each of them got.
 *
 * MySQL returns the distribution — how many buyers of that day did exactly n
 * sessions — and the tail sums happen here, because "reached session 3" is
 * "did 3 or more" and a cumulative sum of a few rows is not worth a second
 * query.
 */
export async function etapasPorDiaDeCompra(
  conn: Connection,
  desde: string,
): Promise<EtapaPorDia[]> {
  const [rows] = await conn.query<
    (RowDataPacket & {
      fecha: string;
      pais: string;
      sesiones: number;
      pacientes: number;
    })[]
  >(
    `SELECT ${DIA_DE_COMPRA} AS fecha,
            l.paisDominio AS pais,
            LEAST(COALESCE(s.total, 0), ${ULTIMA_SESION}) AS sesiones,
            COUNT(*) AS pacientes
       FROM login l
       JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
       LEFT JOIN (SELECT id_paciente, COUNT(*) AS total
                    FROM sesiones WHERE realizada = 1
                   GROUP BY id_paciente) s ON s.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio IN ('AR', 'UY')
        AND p.primera >= ?
      GROUP BY 1, 2, 3`,
    [desde],
  );

  // clave -> cuántos compradores hicieron exactamente n sesiones
  const porDia = new Map<string, Map<number, number>>();
  for (const r of rows) {
    const clave = `${fechaIso(r.fecha)}|${r.pais}`;
    const dist = porDia.get(clave) ?? new Map<number, number>();
    dist.set(Number(r.sesiones), Number(r.pacientes));
    porDia.set(clave, dist);
  }

  const salida: EtapaPorDia[] = [];
  for (const [clave, dist] of porDia) {
    const [fecha, pais] = clave.split("|") as [string, string];
    const compradores = [...dist.values()].reduce((a, b) => a + b, 0);

    // nro_sesion 0 es la compra: la base del embudo.
    salida.push({ fecha, pais, nro_sesion: 0, pacientes: compradores });

    for (let n = 1; n <= ULTIMA_SESION; n++) {
      const llegaron = [...dist.entries()]
        .filter(([hechas]) => hechas >= n)
        .reduce((a, [, cuantos]) => a + cuantos, 0);
      // Una fila en cero no aporta nada y multiplica el upsert por doce.
      if (llegaron > 0) {
        salida.push({ fecha, pais, nro_sesion: n, pacientes: llegaron });
      }
    }
  }

  return salida;
}

/**
 * How long each trip takes, as a histogram of days per day of purchase.
 *
 * A histogram and not a median: medians do not add up, and the screen adds up
 * whatever range it is asked for. With the distribution, the median and the
 * p80 of any window come out exact.
 *
 * A negative gap is clamped to zero. It happens when a courtesy session
 * precedes the purchase, and a wait cannot be less than nothing.
 */
export async function tiemposPorDiaDeCompra(
  conn: Connection,
  desde: string,
): Promise<TiempoPorDia[]> {
  const brecha = (hasta: string, inicio: string) =>
    `GREATEST(${diasLocales(hasta, inicio)}, 0)`;

  const [rows] = await conn.query<
    (RowDataPacket & {
      fecha: string;
      pais: string;
      tramo: number;
      dias: number;
      pacientes: number;
    })[]
  >(
    `WITH ordenadas AS (
       SELECT id_paciente, fecha,
              ROW_NUMBER() OVER (PARTITION BY id_paciente ORDER BY fecha) AS nro
         FROM sesiones
        WHERE realizada = 1
     )
     SELECT ${DIA_DE_COMPRA} AS fecha, l.paisDominio AS pais,
            0 AS tramo,
            ${brecha("ps.primera", "p.primera")} AS dias,
            COUNT(*) AS pacientes
       FROM login l
       JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
       JOIN (${PRIMERA_SESION}) ps ON ps.id_paciente = l.id
      WHERE l.tipo = 1 AND l.paisDominio IN ('AR', 'UY')
        AND p.primera >= ?
      GROUP BY 1, 2, 3, 4

     UNION ALL

     SELECT ${DIA_DE_COMPRA} AS fecha, l.paisDominio AS pais,
            a.nro AS tramo,
            ${brecha("b.fecha", "a.fecha")} AS dias,
            COUNT(*) AS pacientes
       FROM login l
       JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
       JOIN ordenadas a ON a.id_paciente = l.id
                       AND a.nro BETWEEN 1 AND ${ULTIMO_TRAMO}
       JOIN ordenadas b ON b.id_paciente = l.id AND b.nro = a.nro + 1
      WHERE l.tipo = 1 AND l.paisDominio IN ('AR', 'UY')
        AND p.primera >= ?
      GROUP BY 1, 2, 3, 4`,
    [desde, desde],
  );

  return rows.map((r) => ({
    fecha: fechaIso(r.fecha),
    pais: r.pais,
    tramo: Number(r.tramo),
    dias: Number(r.dias),
    pacientes: Number(r.pacientes),
  }));
}

/** mysql2 hands back a Date for a DATE column depending on the driver config. */
function fechaIso(valor: string | Date): string {
  if (valor instanceof Date) {
    // The column is already a local calendar day; formatting it in UTC would
    // slide it back a day for anyone reading from a negative offset.
    const y = valor.getFullYear();
    const m = String(valor.getMonth() + 1).padStart(2, "0");
    const d = String(valor.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(valor).slice(0, 10);
}
