import { withDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The selected cohort as a CSV, session by session.
 *
 * Aggregates only. No column here identifies anyone: the dashboard never reads
 * nombre, apellido, telefono, email or fecha_nacimiento, and an export is
 * still the dashboard (CLAUDE.md, reglas no negociables).
 *
 * It sits behind the same gate as every screen — the middleware matcher covers
 * this path — so a download needs a session like anything else.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const pais = url.searchParams.get("pais") ?? "TOTAL";
  const mes = url.searchParams.get("mes");

  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return new Response("falta ?mes=YYYY-MM", { status: 400 });
  }
  if (!["AR", "UY", "TOTAL"].includes(pais)) {
    return new Response("pais inválido", { status: 400 });
  }

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

  if (filas.length === 0) {
    return new Response("sin datos para esa cohorte", { status: 404 });
  }

  const n = filas[0]!.cohorte_n;
  const compraron = filas[0]!.cohorte_compraron;

  const lineas = [
    "cohorte,pais,etapa,pacientes,pct_de_cohorte,pct_del_paso_anterior",
    fila(mes, pais, "Registros", n, n, null),
    compraron === null
      ? null
      : fila(mes, pais, "Compraron", compraron, n, n),
    ...filas.map((f, i) => {
      const previo = i === 0 ? compraron : filas[i - 1]!.pacientes;
      return fila(mes, pais, `${f.nro_sesion}a sesion`, f.pacientes, n, previo);
    }),
  ].filter((l): l is string => l !== null);

  return new Response(lineas.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cohorte-${pais}-${mes}.csv"`,
    },
  });
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
  return [mes, pais, etapa, pacientes, pct(pacientes, base), pct(pacientes, previo)].join(",");
}
