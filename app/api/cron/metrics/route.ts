import { NextResponse } from "next/server";
import { withMysql } from "@/lib/mysql";
import { isCronAuthorized } from "@/lib/auth";
import { PAISES, monthRangeUtc, type Pais } from "@/lib/queries/shared";
import { registros, registrosPorSource } from "@/lib/queries/registros";
import {
  pacientesNuevos,
  pacientesActivos,
  churn,
} from "@/lib/queries/pacientes";
import {
  conversionCohorte,
  diasHastaPago,
  curvaConversion,
} from "@/lib/queries/conversion";
import { sesionesPorPaciente, precioPorSesion } from "@/lib/queries/ltv";
import {
  percentil,
  conversion,
  churnRate,
  edadCohorteDias,
} from "@/lib/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs the phase 1 queries for one month and returns the numbers, so they can
 * be compared against Looker Studio before anything is written to Supabase.
 *
 * Read-only: it touches MySQL and returns, nothing is persisted. The sync job
 * of phase 3 will call the same functions and upsert the result.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const mes = new URL(request.url).searchParams.get("mes");
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json(
      { error: "missing or invalid ?mes=YYYY-MM" },
      { status: 400 },
    );
  }

  const startedAt = Date.now();

  try {
    const porPais = await withMysql(async (conn) => {
      const out: Record<string, unknown> = {};

      const rango = monthRangeUtc(mes);

      for (const pais of PAISES as readonly Pais[]) {
        const [
          nRegistros,
          nuevos,
          activos,
          cohorte,
          histPago,
          curva,
          bajas,
          porPaciente,
          precios,
        ] = await Promise.all([
            registros(conn, rango, pais),
            pacientesNuevos(conn, rango, pais),
            pacientesActivos(conn, rango, pais),
            conversionCohorte(conn, mes, pais),
            diasHastaPago(conn, mes, pais),
            curvaConversion(conn, pais),
            churn(conn, mes, pais),
            sesionesPorPaciente(conn, mes, pais),
            precioPorSesion(conn, mes, pais),
          ]);

        const edad = edadCohorteDias(mes);
        const conv = conversion(
          cohorte.registros,
          cohorte.convertidos,
          edad,
          curva,
        );

        out[pais] = {
          registros: nRegistros,
          pacientes_nuevos: nuevos,
          pacientes_activos: activos,
          conversion_cohorte: conv.valor,
          conversion_proyectada: conv.proyectada,
          cohorte_edad_dias: edad,
          cohorte_registros: cohorte.registros,
          cohorte_convertidos: cohorte.convertidos,
          mediana_dias_compra: percentil(histPago, 0.5),
          p80_dias_compra: percentil(histPago, 0.8),
          compras_medidas: histPago.reduce((acc, r) => acc + r.n, 0),
          churn_rate: churnRate(bajas.activos_mes_previo, bajas.perdidos),
          churn_activos_mes_previo: bajas.activos_mes_previo,
          churn_perdidos: bajas.perdidos,
          // LTV factors. Still in local currency: the commission and the
          // exchange rate live in marketing.parametros, which is phase 2.
          cohorte_cerrada: edad >= 90,
          ltv_pacientes: porPaciente.pacientes,
          ltv_sesiones: porPaciente.sesiones,
          sesiones_por_paciente:
            porPaciente.pacientes === 0
              ? null
              : porPaciente.sesiones / porPaciente.pacientes,
          precio_por_sesion_local: precios,
        };
      }

      out.registros_por_source = Object.fromEntries(
        await Promise.all(
          (PAISES as readonly Pais[]).map(async (pais) => [
            pais,
            await registrosPorSource(conn, monthRangeUtc(mes), pais),
          ]),
        ),
      );

      return out;
    });

    return NextResponse.json({
      ok: true,
      mes,
      ms: Date.now() - startedAt,
      ...porPais,
    });
  } catch (error) {
    console.error("[cron/metrics] failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown error",
        ms: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }
}
