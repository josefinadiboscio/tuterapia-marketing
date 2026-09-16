import { withDb } from "@/lib/db";
import { withMysql } from "@/lib/mysql";
import { monthRangeUtc, PRIMER_PAGO, type Pais } from "@/lib/queries/shared";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The selected cohort as a CSV, in two flavours.
 *
 * Without `?nominal=1` it is the funnel stage by stage, aggregates only, read
 * from Supabase like every screen.
 *
 * With `?nominal=1` it is one row per patient, carrying id, name and email —
 * the export the product owner asked for on 2026-09-16 and the only place in
 * this codebase that touches personal columns (CLAUDE.md).
 *
 * The nominal query goes straight to MySQL and the result is streamed to the
 * browser without being stored. Putting names and emails into Supabase to
 * serve them from there would leave a second permanent copy of a list of
 * people in therapy, re-synced every night; reading them on demand leaves
 * none. `telefono` and `fecha_nacimiento` are not read: nobody asked for them.
 *
 * Both flavours sit behind the same session gate as every screen — the
 * middleware matcher covers this path.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pais = url.searchParams.get("pais") ?? "TOTAL";
  const mes = url.searchParams.get("mes");
  const nominal = url.searchParams.get("nominal") === "1";

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return new Response("falta ?mes=YYYY-MM", { status: 400 });
  }
  if (!["AR", "UY", "TOTAL"].includes(pais)) {
    return new Response("pais inválido", { status: 400 });
  }

  const cuerpo = nominal
    ? await nominalCsv(mes, pais)
    : await agregadoCsv(mes, pais);

  if (cuerpo === null) {
    return new Response("sin datos para esa cohorte", { status: 404 });
  }

  const nombre = nominal
    ? `cohorte-${pais}-${mes}-nominal.csv`
    : `cohorte-${pais}-${mes}.csv`;

  return new Response(cuerpo, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      // A patient list is never cached, by us or by anything in between.
      "cache-control": "no-store, private",
    },
  });
}

/**
 * One row per patient of the cohort, with how far they got.
 *
 * Every stage question is answerable from this one file: the columns say
 * whether they bought and how many sessions they did, so "bought but never sat
 * down" is a filter in a spreadsheet rather than another download.
 */
async function nominalCsv(mes: string, pais: string): Promise<string | null> {
  const { start, end } = monthRangeUtc(mes);
  const paises: Pais[] = pais === "TOTAL" ? ["AR", "UY"] : [pais as Pais];

  const filas = await withMysql(async (conn) => {
    const [rows] = await conn.query<
      (RowDataPacket & {
        id: number;
        nombre: string | null;
        apellido: string | null;
        email: string | null;
        pais: string;
        registro: string;
        compro: number;
        sesiones: number;
      })[]
    >(
      `SELECT l.id,
              p.nombre, p.apellido, l.email,
              l.paisDominio AS pais,
              DATE(DATE_SUB(l.creacion, INTERVAL 3 HOUR)) AS registro,
              (pago.primera IS NOT NULL) AS compro,
              COALESCE(s.total, 0) AS sesiones
         FROM login l
         LEFT JOIN pacientes p ON p.id_login = l.id
         LEFT JOIN (${PRIMER_PAGO}) pago ON pago.id_paciente = l.id
         LEFT JOIN (SELECT id_paciente, COUNT(*) AS total
                      FROM sesiones WHERE realizada = 1
                     GROUP BY id_paciente) s ON s.id_paciente = l.id
        WHERE l.tipo = 1 AND l.paisDominio IN (?)
          AND l.creacion >= ? AND l.creacion < ?
        ORDER BY sesiones DESC, l.creacion`,
      [paises, start, end],
    );
    return rows;
  });

  if (filas.length === 0) return null;

  const lineas = [
    "id_paciente,nombre,apellido,email,pais,fecha_registro,compro,sesiones_realizadas",
    ...filas.map((f) =>
      [
        f.id,
        campo(f.nombre),
        campo(f.apellido),
        campo(f.email),
        f.pais,
        String(f.registro).slice(0, 10),
        f.compro ? "si" : "no",
        f.sesiones,
      ].join(","),
    ),
  ];
  return lineas.join("\n") + "\n";
}

/** The funnel stage by stage, from the aggregates. */
async function agregadoCsv(mes: string, pais: string): Promise<string | null> {
  const filas = await withDb(async (db) => {
    const { rows } = await db.query<{
      nro_sesion: number;
      pacientes: number;
      cohorte_n: number;
      cohorte_compraron: number | null;
    }>(
      `select nro_sesion, pacientes, cohorte_n, cohorte_compraron
         from marketing.cohorte_sesiones
        where pais = $1 and to_char(cohorte, 'YYYY-MM') = $2
        order by nro_sesion`,
      [pais, mes],
    );
    return rows;
  });

  if (filas.length === 0) return null;

  const n = filas[0]!.cohorte_n;
  const compraron = filas[0]!.cohorte_compraron;

  const lineas = [
    "cohorte,pais,etapa,pacientes,pct_de_cohorte,pct_del_paso_anterior",
    fila(mes, pais, "Registros", n, n, null),
    compraron === null ? null : fila(mes, pais, "Compraron", compraron, n, n),
    ...filas.map((f, i) => {
      const previo = i === 0 ? compraron : filas[i - 1]!.pacientes;
      return fila(mes, pais, `${f.nro_sesion}a sesion`, f.pacientes, n, previo);
    }),
  ].filter((l): l is string => l !== null);

  return lineas.join("\n") + "\n";
}

function fila(
  mes: string,
  pais: string,
  etapa: string,
  pacientes: number,
  base: number,
  previo: number | null,
): string {
  const pct = (a: number, b: number | null) =>
    b && b > 0 ? ((a / b) * 100).toFixed(1) : "";
  return [mes, pais, etapa, pacientes, pct(pacientes, base), pct(pacientes, previo)].join(
    ",",
  );
}

/** Names carry commas, quotes and accents. Quote everything and double the quotes. */
function campo(valor: string | null): string {
  return `"${(valor ?? "").replace(/"/g, '""')}"`;
}
