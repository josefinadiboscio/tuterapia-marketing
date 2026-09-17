import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import {
  LOCAL_UTC_OFFSET_HOURS,
  PRIMER_PAGO,
  PRIMERA_SESION,
} from "@/lib/queries/shared";
import { madurez, ULTIMA_ETAPA } from "@/lib/funnel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The same stage counts twice: straight from MySQL, and as the screen reads
 * them out of the Supabase aggregate.
 *
 * Written on purpose in a different shape from lib/queries/funnel.ts —
 * conditional sums over one pass instead of a distribution expanded in
 * JavaScript — so a mistake in the pipeline shows up as a difference rather
 * than being reproduced identically on both sides.
 *
 * Temporary, like /api/cron/diff: it exists to answer "does the screen match
 * the database" once, out loud.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const pais = params.get("pais") ?? "AR";
  const periodo = Number(params.get("periodo") ?? 90);
  if (!["AR", "UY"].includes(pais) || ![90, 180, 365].includes(periodo)) {
    return NextResponse.json(
      { error: "usar ?pais=AR|UY&periodo=90|180|365" },
      { status: 400 },
    );
  }

  const hoy = diaLocal(new Date());
  const desde = sumarDias(hoy, -(periodo - 1));
  const etapas = Array.from({ length: ULTIMA_ETAPA + 1 }, (_, nro) => ({
    nro,
    corte: minimo(hoy, sumarDias(hoy, -madurez(nro))),
  }));

  const mysql = await contarEnMysql(pais, desde, etapas);
  const supabase = await contarEnSupabase(pais, desde, etapas);
  const noShow = await diagnosticarNoShow(pais, desde, etapas[1]!.corte);

  const filas = etapas.map(({ nro, corte }) => {
    const m = mysql.get(nro)!;
    const s = supabase.get(nro) ?? { base: 0, llegaron: 0 };
    return {
      etapa: nro === 0 ? "compraron" : `sesion_${nro}`,
      corte,
      mysql: m,
      supabase: s,
      coincide: m.base === s.base && m.llegaron === s.llegaron,
    };
  });

  return NextResponse.json({
    ok: true,
    pais,
    periodo,
    no_show: noShow,
    desde,
    hasta: hoy,
    todo_coincide: filas.every((f) => f.coincide),
    filas,
  });
}

type Etapa = { nro: number; corte: string };

/**
 * One pass over the buyers, with a conditional sum per stage: how many bought
 * inside that stage's window and how many of those reached it.
 */
async function contarEnMysql(
  pais: string,
  desde: string,
  etapas: Etapa[],
): Promise<Map<number, { base: number; llegaron: number }>> {
  const dia = `DATE(DATE_SUB(p.primera, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR))`;
  const columnas = etapas
    .map(
      ({ nro }) =>
        `SUM(${dia} <= ?) AS base_${nro},
         SUM(${dia} <= ? AND COALESCE(s.total, 0) >= ${Math.max(nro, 0)}) AS llego_${nro}`,
    )
    .join(",\n");

  const valores = etapas.flatMap(({ corte }) => [corte, corte]);

  return withMysql(async (conn) => {
    const [rows] = await conn.query<(RowDataPacket & Record<string, number>)[]>(
      `SELECT ${columnas}
         FROM login l
         JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
         LEFT JOIN (SELECT id_paciente, COUNT(*) AS total
                      FROM sesiones WHERE realizada = 1
                     GROUP BY id_paciente) s ON s.id_paciente = l.id
        WHERE l.tipo = 1 AND l.paisDominio = ?
          AND ${dia} >= ?`,
      [...valores, pais, desde],
    );

    const fila = rows[0] ?? {};
    return new Map(
      etapas.map(({ nro }) => [
        nro,
        {
          base: Number(fila[`base_${nro}`] ?? 0),
          llegaron: Number(fila[`llego_${nro}`] ?? 0),
        },
      ]),
    );
  });
}

/** The same numbers as the screen reads them out of the aggregate. */
async function contarEnSupabase(
  pais: string,
  desde: string,
  etapas: Etapa[],
): Promise<Map<number, { base: number; llegaron: number }>> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ nro: string; base: string; llego: string }>(
      `with etapa as (
         select nro, corte from unnest($3::int[], $4::date[]) as t(nro, corte)
       )
       select e.nro::text,
              coalesce(sum(case when f.nro_sesion = 0 then f.pacientes end), 0)::text
                as base,
              coalesce(sum(case when f.nro_sesion = e.nro then f.pacientes end), 0)::text
                as llego
         from etapa e
         left join marketing.funnel_etapas f
                on f.pais = $1 and f.fecha_compra >= $2 and f.fecha_compra <= e.corte
        group by e.nro`,
      [pais, desde, etapas.map((e) => e.nro), etapas.map((e) => e.corte)],
    );

    return new Map(
      rows.map((r) => [
        Number(r.nro),
        {
          base: Number(r.base),
          // Stage zero is the purchase, and its own count is the base.
          llegaron: Number(r.nro) === 0 ? Number(r.base) : Number(r.llego),
        },
      ]),
    );
  });
}

function diaLocal(ahora: Date): string {
  return new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function sumarDias(fecha: string, dias: number): string {
  return new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

function minimo(a: string, b: string): string {
  return a < b ? a : b;
}


/**
 * Why the purchase-to-first-session drop is as small as it is.
 *
 * The stage counts a patient's first realized session over their whole life,
 * which includes a session that happened BEFORE they paid. If that is common —
 * a first session for free and the purchase afterwards — then "95% of buyers
 * sat down" is partly people who had already sat down, and the no-show of the
 * funnel is understated by construction.
 *
 * This splits the buyers into the cases so the answer is a number and not a
 * theory.
 */
async function diagnosticarNoShow(pais: string, desde: string, corte: string) {
  const dia = (col: string) =>
    `DATE(DATE_SUB(${col}, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR))`;
  const diaPago = dia("p.primera");
  const diaSesion = dia("ps.primera");

  return withMysql(async (conn) => {
    const [rows] = await conn.query<(RowDataPacket & Record<string, number>)[]>(
      `SELECT COUNT(*) AS compradores,
              SUM(ps.primera IS NULL) AS sin_ninguna_sesion,
              SUM(${diaSesion} < ${diaPago}) AS sesion_antes_de_pagar,
              SUM(${diaSesion} = ${diaPago}) AS sesion_el_mismo_dia,
              SUM(${diaSesion} > ${diaPago}) AS sesion_despues_de_pagar,
              SUM(${diaSesion} < ${diaPago}
                  AND DATEDIFF(${diaPago}, ${diaSesion}) > 30) AS sesion_mas_de_30_dias_antes,
              -- Of those with no realized session: did they book one at all?
              -- "Never booked" and "booked and never held" are different
              -- problems, and the 5% hides both.
              SUM(ps.primera IS NULL AND ag.agendadas > 0) AS sin_sesion_pero_agendaron,
              SUM(ps.primera IS NULL AND COALESCE(ag.agendadas, 0) = 0)
                AS sin_sesion_y_sin_agendar,
              -- Sanity check on the flag itself: if nothing is ever 0, then
              -- realizada does not discriminate and the whole funnel is wrong.
              SUM(COALESCE(ag.agendadas, 0)) AS sesiones_agendadas_sin_realizar,
              SUM(COALESCE(re.realizadas, 0)) AS sesiones_realizadas
         FROM login l
         JOIN (${PRIMER_PAGO}) p ON p.id_paciente = l.id
         LEFT JOIN (${PRIMERA_SESION}) ps ON ps.id_paciente = l.id
         LEFT JOIN (SELECT id_paciente, COUNT(*) AS agendadas
                      FROM sesiones WHERE realizada = 0
                     GROUP BY id_paciente) ag ON ag.id_paciente = l.id
         LEFT JOIN (SELECT id_paciente, COUNT(*) AS realizadas
                      FROM sesiones WHERE realizada = 1
                     GROUP BY id_paciente) re ON re.id_paciente = l.id
        WHERE l.tipo = 1 AND l.paisDominio = ?
          AND ${diaPago} >= ? AND ${diaPago} <= ?`,
      [pais, desde, corte],
    );

    const f = rows[0] ?? {};
    const n = (clave: string) => Number(f[clave] ?? 0);
    const compradores = n("compradores");

    return {
      corte,
      compradores,
      sin_ninguna_sesion: n("sin_ninguna_sesion"),
      sesion_antes_de_pagar: n("sesion_antes_de_pagar"),
      sesion_el_mismo_dia: n("sesion_el_mismo_dia"),
      sesion_despues_de_pagar: n("sesion_despues_de_pagar"),
      sesion_mas_de_30_dias_antes: n("sesion_mas_de_30_dias_antes"),
      sin_sesion_pero_agendaron: n("sin_sesion_pero_agendaron"),
      sin_sesion_y_sin_agendar: n("sin_sesion_y_sin_agendar"),
      sesiones_agendadas_sin_realizar: n("sesiones_agendadas_sin_realizar"),
      sesiones_realizadas: n("sesiones_realizadas"),
      // What the drop would be if only a session AFTER the purchase counted.
      caida_si_solo_cuenta_despues:
        compradores === 0
          ? null
          : Number(
              (
                ((compradores - n("sesion_despues_de_pagar")) / compradores) *
                100
              ).toFixed(1),
            ),
    };
  });
}
