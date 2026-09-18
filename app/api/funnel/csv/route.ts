import { withDb } from "@/lib/db";
import { withMysql } from "@/lib/mysql";
import { monthRangeUtc, PRIMER_PAGO, type Pais } from "@/lib/queries/shared";
import { usuarioActual } from "@/lib/supabase/servidor";
import { ULTIMO_TRAMO } from "@/lib/queries/funnel";
import type { RowDataPacket } from "mysql2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * La gente que cayó en un tramo de una cohorte, con nombre y mail.
 *
 * Es la única ruta del proyecto que toca columnas personales, y la única que
 * consulta MySQL en vivo (CLAUDE.md). Lee `nombre` y `email` en el momento de
 * la descarga y no los guarda en ningún lado: no pasan por Supabase, no quedan
 * en un agregado, no los toca el cron. Guardarlos sería dejar una segunda
 * copia permanente de un padrón de pacientes en tratamiento, sincronizada
 * todas las noches.
 *
 * Tres condiciones, todas obligatorias, y ninguna es opcional porque la grilla
 * dejó la descarga a un clic de distancia:
 *
 *  1. sesión válida — la cubre el middleware;
 *  2. permiso `export_pii` en `marketing.permisos`, que es distinto de poder
 *     leer el dashboard;
 *  3. una fila en `marketing.export_log` ANTES de mandar el archivo. Si esa
 *     escritura falla, la descarga no sale: una exportación sin registro es
 *     exactamente la situación de la que veníamos.
 */

/** Lo único que se exporta. Si hiciera falta otra columna, se agrega acá. */
const COLUMNAS = "email,nombre,fecha_registro,pais,utm_source";

const AVISO =
  "# ATENCION: datos personales de pacientes en tratamiento. " +
  "Distribucion restringida: no reenviar, no subir a servicios de terceros, " +
  "borrar el archivo cuando termine el analisis.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pais = url.searchParams.get("pais") ?? "TOTAL";
  const cohorte = url.searchParams.get("cohorte");
  const tramo = Number(url.searchParams.get("tramo"));

  if (!cohorte || !/^\d{4}-\d{2}$/.test(cohorte)) {
    return new Response("falta ?cohorte=YYYY-MM", { status: 400 });
  }
  if (!Number.isInteger(tramo) || tramo < 0 || tramo > ULTIMO_TRAMO) {
    return new Response("?tramo fuera de rango", { status: 400 });
  }
  if (!["AR", "UY", "TOTAL"].includes(pais)) {
    return new Response("pais inválido", { status: 400 });
  }

  const usuario = await usuarioActual();
  if (!usuario) return new Response("sin sesión", { status: 401 });

  if (!(await puedeExportar(usuario.id))) {
    // 403 y no 404: la celda existe y el número se ve en pantalla. Lo que
    // falta es el permiso, y decirlo es más útil que fingir que no está.
    return new Response(
      "Esta cuenta no tiene permiso de exportación (export_pii).",
      { status: 403 },
    );
  }

  const filas = await gente(cohorte, pais, tramo);

  // El registro va primero. Si no se puede escribir, no hay archivo.
  try {
    await registrar(usuario, cohorte, tramo, pais, filas.length);
  } catch (error) {
    console.error("[funnel/csv] no se pudo escribir export_log", error);
    return new Response("no se pudo registrar la descarga", { status: 500 });
  }

  const lineas = [
    AVISO,
    COLUMNAS,
    ...filas.map((f) =>
      [
        campo(f.email),
        campo(f.nombre),
        String(f.registro).slice(0, 10),
        f.pais,
        campo(f.utm_source),
      ].join(","),
    ),
  ];

  const nombre = `caida-${pais}-${cohorte}-tramo${tramo}.csv`;

  return new Response(lineas.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${nombre}"`,
      // Un padrón de pacientes no se cachea, ni acá ni en nada del medio.
      "cache-control": "no-store, private",
    },
  });
}

async function puedeExportar(usuarioId: string): Promise<boolean> {
  return withDb(async (db) => {
    const { rows } = await db.query<{ export_pii: boolean }>(
      `select export_pii from marketing.permisos where usuario_id = $1`,
      [usuarioId],
    );
    return rows[0]?.export_pii === true;
  });
}

async function registrar(
  usuario: { id: string; email: string },
  cohorte: string,
  tramo: number,
  pais: string,
  filas: number,
): Promise<void> {
  await withDb((db) =>
    db.query(
      `insert into marketing.export_log
         (usuario_id, email, cohorte, tramo, pais, filas)
       values ($1, $2, $3, $4, $5, $6)`,
      [usuario.id, usuario.email, cohorte, tramo, pais, filas],
    ),
  );
}

/**
 * Los que compraron en el mes y se quedaron con exactamente `tramo` sesiones.
 *
 * Caer en el tramo t es haber llegado a la etapa t y no a la t+1, que sobre
 * sesiones realizadas es tener exactamente t. El tramo 0 —compró y no se sentó
 * nunca— son los de cero sesiones, y por eso el LEFT JOIN con COALESCE: esa
 * gente no tiene ninguna fila en `sesiones`.
 *
 * Es la misma definición que usa la grilla, contada del otro lado: si estos
 * dos números se separan, uno de los dos está mal.
 */
async function gente(
  cohorte: string,
  pais: string,
  tramo: number,
): Promise<
  {
    email: string | null;
    nombre: string | null;
    registro: string;
    pais: string;
    utm_source: string | null;
  }[]
> {
  const { start, end } = monthRangeUtc(cohorte);
  const paises: Pais[] = pais === "TOTAL" ? ["AR", "UY"] : [pais as Pais];

  return withMysql(async (conn) => {
    const [rows] = await conn.query<
      (RowDataPacket & {
        email: string | null;
        nombre: string | null;
        registro: string;
        pais: string;
        utm_source: string | null;
      })[]
    >(
      `SELECT l.email,
              p.nombre,
              DATE(DATE_SUB(l.creacion, INTERVAL 3 HOUR)) AS registro,
              l.paisDominio AS pais,
              l.utm_source
         FROM login l
         JOIN (${PRIMER_PAGO}) pago ON pago.id_paciente = l.id
         LEFT JOIN pacientes p ON p.id_login = l.id
         LEFT JOIN (SELECT id_paciente, COUNT(*) AS total
                      FROM sesiones WHERE realizada = 1
                     GROUP BY id_paciente) s ON s.id_paciente = l.id
        WHERE l.tipo = 1 AND l.paisDominio IN (?)
          AND pago.primera >= ? AND pago.primera < ?
          AND COALESCE(s.total, 0) = ?
        ORDER BY l.creacion`,
      [paises, start, end, tramo],
    );
    return rows;
  });
}

/** Los nombres traen comas, comillas y acentos. Todo entre comillas, dobladas. */
function campo(valor: string | null): string {
  return `"${(valor ?? "").replace(/"/g, '""')}"`;
}
