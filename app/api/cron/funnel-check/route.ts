import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2";
import { withMysql } from "@/lib/mysql";
import { withDb } from "@/lib/db";
import { isCronAuthorized } from "@/lib/auth";
import { LOCAL_UTC_OFFSET_HOURS, PRIMER_PAGO } from "@/lib/queries/shared";
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
