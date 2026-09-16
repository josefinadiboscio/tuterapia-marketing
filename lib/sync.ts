import type { Connection } from "mysql2/promise";
import type { Client } from "pg";
import {
  PAISES,
  VENTANA_CONVERSION_DIAS,
  monthRangeUtc,
  rangoParcialUtc,
  transcurridoEnMes,
  type Pais,
} from "@/lib/queries/shared";
import { registros, registrosPorSource } from "@/lib/queries/registros";
import {
  pacientesNuevos,
  pacientesActivados,
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
  cac,
  ltv,
  margenUsdSesion,
  edadCohorteDias,
} from "@/lib/metrics";
import { resolverPlataforma, SIN_MAPEAR, type UtmMapping } from "@/lib/utm";
import { transaction } from "@/lib/db";

/** One row of marketing.metricas_mensuales, before it is written. */
type Fila = {
  mes: string;
  pais: string;
  plataforma: string;
  registros: number | null;
  pacientes_nuevos: number | null;
  pacientes_activados: number | null;
  pacientes_activos: number | null;
  conversion_cohorte: number | null;
  conversion_proyectada: boolean;
  cohorte_edad_dias: number | null;
  mediana_dias_compra: number | null;
  p80_dias_compra: number | null;
  gasto_usd: number | null;
  cac_usd: number | null;
  costo_por_registro_usd: number | null;
  sesiones_por_paciente: number | null;
  margen_usd_sesion: number | null;
  ltv_usd: number | null;
  cohorte_cerrada: boolean;
  churn_rate: number | null;
  es_provisorio: boolean;
  registros_tramo_previo: number | null;
  pacientes_nuevos_tramo_previo: number | null;
  pacientes_activos_tramo_previo: number | null;
  tramo_dias: number | null;
};

/** The same stretch of the previous month, for a month still running. */
type TramoPrevio = {
  registros: number;
  pacientes_nuevos: number;
  pacientes_activos: number;
  dias: number;
};

/**
 * Computes every row for one month and writes them in a single transaction.
 * Returns how many rows were written.
 *
 * The write is an upsert on the primary key, never an insert: the job can run
 * twice on the same day and has to land on the same state.
 */
export async function sincronizarMes(
  mysql: Connection,
  db: Client,
  mes: string,
): Promise<number> {
  const [mapping, parametros, gastos] = await Promise.all([
    leerMapping(db),
    leerParametros(db, mes),
    leerGastos(db, mes),
  ]);

  const esProvisorio = mes === mesActual();
  const edad = edadCohorteDias(mes);
  const filas: Fila[] = [];

  // Kept per country so the TOTAL row can be built from the raw aggregates
  // rather than from the rounded per-country results.
  const crudos: Record<string, Awaited<ReturnType<typeof medirPais>>> = {};

  const tramos: Record<string, TramoPrevio | null> = {};

  for (const pais of PAISES as readonly Pais[]) {
    const medido = await medirPais(mysql, mes, pais);
    crudos[pais] = medido;

    const tramo = esProvisorio
      ? await medirTramoPrevio(mysql, mes, pais)
      : null;
    tramos[pais] = tramo;

    filas.push(
      armarFila({
        mes,
        pais,
        plataforma: "TODAS",
        medido,
        edad,
        esProvisorio,
        tramo,
        gastoUsd: gastos[pais] ?? null,
        pctComision: parametros[`pct_comision:${pais}`] ?? null,
        tipoCambio: parametros[`tipo_cambio:${pais}`] ?? null,
      }),
    );

    // Per-platform rows carry volume only. LTV or churn split by platform
    // would leave cohorts of three patients.
    for (const [plataforma, n] of Object.entries(
      agruparPorPlataforma(medido.porSource, mapping),
    )) {
      filas.push({
        ...filaVacia(mes, pais, plataforma, esProvisorio),
        registros: n,
      });
    }
  }

  filas.push(armarTotal(mes, crudos, edad, esProvisorio, gastos, tramos));

  // What no pattern matched, with the volume behind it. The dashboard never
  // queries MySQL, so Admin can only warn about a gap the job wrote down.
  const sinMapear = (PAISES as readonly Pais[]).flatMap((pais) =>
    (crudos[pais]?.porSource ?? [])
      .filter(
        (fila) => resolverPlataforma(fila.utm_source, mapping) === SIN_MAPEAR,
      )
      .map((fila) => ({ pais, utm_source: fila.utm_source, n: fila.n })),
  );

  await transaction(db, async () => {
    for (const fila of filas) await upsert(db, fila);

    await db.query(
      `delete from marketing.utm_sin_mapear where mes = $1`,
      [`${mes}-01`],
    );
    for (const s of sinMapear) {
      await db.query(
        `insert into marketing.utm_sin_mapear (mes, pais, utm_source, registros)
         values ($1, $2, $3, $4)
         on conflict (mes, pais, utm_source)
         do update set registros = excluded.registros, detectado_en = now()`,
        [`${mes}-01`, s.pais, s.utm_source, s.n],
      );
    }
  });

  return filas.length;
}

async function medirPais(mysql: Connection, mes: string, pais: Pais) {
  const rango = monthRangeUtc(mes);
  const [
    nRegistros,
    nuevos,
    activados,
    activos,
    cohorte,
    histPago,
    curva,
    bajas,
    porPaciente,
    precios,
    porSource,
  ] = await Promise.all([
    registros(mysql, rango, pais),
    pacientesNuevos(mysql, rango, pais),
    pacientesActivados(mysql, rango, pais),
    pacientesActivos(mysql, rango, pais),
    conversionCohorte(mysql, mes, pais),
    diasHastaPago(mysql, mes, pais),
    curvaConversion(mysql, pais),
    churn(mysql, mes, pais),
    sesionesPorPaciente(mysql, mes, pais),
    precioPorSesion(mysql, mes, pais),
    registrosPorSource(mysql, rango, pais),
  ]);

  return {
    registros: nRegistros,
    nuevos,
    activados,
    activos,
    cohorte,
    histPago,
    curva,
    bajas,
    porPaciente,
    precios,
    porSource,
  };
}

function armarFila({
  mes,
  pais,
  plataforma,
  medido,
  edad,
  esProvisorio,
  tramo,
  gastoUsd,
  pctComision,
  tipoCambio,
}: {
  mes: string;
  pais: string;
  plataforma: string;
  medido: Awaited<ReturnType<typeof medirPais>>;
  edad: number;
  esProvisorio: boolean;
  tramo: TramoPrevio | null;
  gastoUsd: number | null;
  pctComision: number | null;
  tipoCambio: number | null;
}): Fila {
  const conv = conversion(
    medido.cohorte.registros,
    medido.cohorte.convertidos,
    edad,
    medido.curva,
  );

  const maduro = edad >= VENTANA_CONVERSION_DIAS;
  const margen = margenPonderado(medido.precios, pctComision, tipoCambio);
  const porPaciente =
    medido.porPaciente.pacientes === 0
      ? null
      : medido.porPaciente.sesiones / medido.porPaciente.pacientes;
  const cerrada = edad >= 90;

  return {
    mes,
    pais,
    plataforma,
    registros: medido.registros,
    pacientes_nuevos: medido.nuevos,
    pacientes_activados: medido.activados,
    pacientes_activos: medido.activos,
    conversion_cohorte: conv.valor,
    conversion_proyectada: conv.proyectada,
    cohorte_edad_dias: edad,
    // The median only means something once the cohort has had its full 30
    // days: before that it can only contain the people who paid fast.
    mediana_dias_compra: maduro ? percentil(medido.histPago, 0.5) : null,
    p80_dias_compra: maduro ? percentil(medido.histPago, 0.8) : null,
    gasto_usd: gastoUsd,
    cac_usd: gastoUsd === null ? null : cac(gastoUsd, medido.nuevos),
    costo_por_registro_usd:
      gastoUsd === null ? null : cac(gastoUsd, medido.registros),
    // The LTV factors only mean something once the cohort has closed.
    sesiones_por_paciente: cerrada ? porPaciente : null,
    margen_usd_sesion: margen,
    ltv_usd: cerrada ? ltv(porPaciente, margen) : null,
    cohorte_cerrada: cerrada,
    churn_rate: churnRate(medido.bajas.activos_mes_previo, medido.bajas.perdidos),
    es_provisorio: esProvisorio,
    registros_tramo_previo: tramo?.registros ?? null,
    pacientes_nuevos_tramo_previo: tramo?.pacientes_nuevos ?? null,
    pacientes_activos_tramo_previo: tramo?.pacientes_activos ?? null,
    tramo_dias: tramo?.dias ?? null,
  };
}

/**
 * The same stretch of the previous month: its first N days, where N is how
 * much of the current month has elapsed.
 */
async function medirTramoPrevio(
  mysql: Connection,
  mes: string,
  pais: Pais,
): Promise<TramoPrevio> {
  const transcurrido = transcurridoEnMes(mes);
  const rango = rangoParcialUtc(mesAnterior(mes), transcurrido);

  const [reg, nuevos, activos] = await Promise.all([
    registros(mysql, rango, pais),
    pacientesNuevos(mysql, rango, pais),
    pacientesActivados(mysql, rango, pais),
    pacientesActivos(mysql, rango, pais),
  ]);

  return {
    registros: reg,
    pacientes_nuevos: nuevos,
    pacientes_activos: activos,
    dias: Math.floor(transcurrido / 86_400_000),
  };
}

function mesAnterior(mes: string): string {
  const [year, month] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * The TOTAL row is computed from the countries' raw aggregates, never by
 * averaging their results: registros add up, a median does not.
 */
function armarTotal(
  mes: string,
  crudos: Record<string, Awaited<ReturnType<typeof medirPais>>>,
  edad: number,
  esProvisorio: boolean,
  gastos: Record<string, number>,
  tramos: Record<string, TramoPrevio | null>,
): Fila {
  const paises = Object.values(crudos);
  const suma = (fn: (m: (typeof paises)[number]) => number) =>
    paises.reduce((acc, m) => acc + fn(m), 0);

  const histPago = paises.flatMap((m) => m.histPago);
  const curva = paises.flatMap((m) => m.curva);
  const cohorteRegistros = suma((m) => m.cohorte.registros);
  const cohorteConvertidos = suma((m) => m.cohorte.convertidos);
  const conv = conversion(cohorteRegistros, cohorteConvertidos, edad, curva);

  const pacientes = suma((m) => m.porPaciente.pacientes);
  const sesiones = suma((m) => m.porPaciente.sesiones);
  const activosPrevio = suma((m) => m.bajas.activos_mes_previo);
  const perdidos = suma((m) => m.bajas.perdidos);
  const gastoUsd = Object.values(gastos).reduce((a, b) => a + b, 0) || null;
  const nuevos = suma((m) => m.nuevos);
  const cerrada = edad >= 90;

  return {
    mes,
    pais: "TOTAL",
    plataforma: "TODAS",
    registros: suma((m) => m.registros),
    pacientes_nuevos: nuevos,
    pacientes_activados: suma((m) => m.activados),
    pacientes_activos: suma((m) => m.activos),
    conversion_cohorte: conv.valor,
    conversion_proyectada: conv.proyectada,
    cohorte_edad_dias: edad,
    mediana_dias_compra:
      edad >= VENTANA_CONVERSION_DIAS
        ? percentil(consolidar(histPago), 0.5)
        : null,
    p80_dias_compra:
      edad >= VENTANA_CONVERSION_DIAS
        ? percentil(consolidar(histPago), 0.8)
        : null,
    gasto_usd: gastoUsd,
    cac_usd: gastoUsd === null ? null : cac(gastoUsd, nuevos),
    costo_por_registro_usd:
      gastoUsd === null ? null : cac(gastoUsd, suma((m) => m.registros)),
    sesiones_por_paciente:
      cerrada && pacientes > 0 ? sesiones / pacientes : null,
    // A single margin across two currencies would be meaningless.
    margen_usd_sesion: null,
    ltv_usd: null,
    cohorte_cerrada: cerrada,
    churn_rate: churnRate(activosPrevio, perdidos),
    es_provisorio: esProvisorio,
    registros_tramo_previo: sumaTramo(tramos, (t) => t.registros),
    pacientes_nuevos_tramo_previo: sumaTramo(tramos, (t) => t.pacientes_nuevos),
    pacientes_activos_tramo_previo: sumaTramo(
      tramos,
      (t) => t.pacientes_activos,
    ),
    tramo_dias: Object.values(tramos).find((t) => t)?.dias ?? null,
  };
}

function sumaTramo(
  tramos: Record<string, TramoPrevio | null>,
  fn: (t: TramoPrevio) => number,
): number | null {
  const presentes = Object.values(tramos).filter((t): t is TramoPrevio => !!t);
  if (presentes.length === 0) return null;
  return presentes.reduce((acc, t) => acc + fn(t), 0);
}

function consolidar(hist: { dias: number; n: number }[]) {
  const acc = new Map<number, number>();
  for (const row of hist) acc.set(row.dias, (acc.get(row.dias) ?? 0) + row.n);
  return [...acc.entries()]
    .map(([dias, n]) => ({ dias, n }))
    .sort((a, b) => a.dias - b.dias);
}

/**
 * Margin per session in USD, averaged across currencies weighted by the
 * sessions each one bought. A `$` payment divides by its own country's rate;
 * a `U$S` payment does not divide at all.
 */
function margenPonderado(
  precios: { moneda: string; sesiones: number; precio_sesion: number }[],
  pctComision: number | null,
  tipoCambio: number | null,
): number | null {
  if (pctComision === null) return null;

  let sesiones = 0;
  let margenTotal = 0;

  for (const fila of precios) {
    const margen = margenUsdSesion({
      precioLocal: fila.precio_sesion,
      moneda: fila.moneda,
      pctComision,
      tipoCambio,
    });
    if (margen === null) continue;
    margenTotal += margen * fila.sesiones;
    sesiones += fila.sesiones;
  }

  return sesiones === 0 ? null : margenTotal / sesiones;
}

function agruparPorPlataforma(
  porSource: { utm_source: string; n: number }[],
  mapping: UtmMapping[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const fila of porSource) {
    const plataforma = resolverPlataforma(fila.utm_source, mapping);
    out[plataforma] = (out[plataforma] ?? 0) + fila.n;
  }
  return out;
}

function filaVacia(
  mes: string,
  pais: string,
  plataforma: string,
  esProvisorio: boolean,
): Fila {
  return {
    mes,
    pais,
    plataforma,
    registros: null,
    pacientes_nuevos: null,
    pacientes_activados: null,
    pacientes_activos: null,
    conversion_cohorte: null,
    conversion_proyectada: false,
    cohorte_edad_dias: null,
    mediana_dias_compra: null,
    p80_dias_compra: null,
    gasto_usd: null,
    cac_usd: null,
    costo_por_registro_usd: null,
    sesiones_por_paciente: null,
    margen_usd_sesion: null,
    ltv_usd: null,
    cohorte_cerrada: false,
    churn_rate: null,
    es_provisorio: esProvisorio,
    registros_tramo_previo: null,
    pacientes_nuevos_tramo_previo: null,
    pacientes_activos_tramo_previo: null,
    tramo_dias: null,
  };
}

async function upsert(db: Client, fila: Fila): Promise<void> {
  await db.query(
    `insert into marketing.metricas_mensuales (
       mes, pais, plataforma, registros, pacientes_nuevos, pacientes_activados,
       pacientes_activos,
       conversion_cohorte, conversion_proyectada, cohorte_edad_dias,
       mediana_dias_compra, p80_dias_compra, gasto_usd, cac_usd,
       costo_por_registro_usd,
       sesiones_por_paciente, margen_usd_sesion, ltv_usd, cohorte_cerrada,
       churn_rate, es_provisorio, registros_tramo_previo,
       pacientes_nuevos_tramo_previo, pacientes_activos_tramo_previo,
       tramo_dias, actualizado_en
     ) values (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
       $17, $18, $19, $20, $21, $22, $23, $24, $25, now()
     )
     on conflict (mes, pais, plataforma) do update set
       registros = excluded.registros,
       pacientes_nuevos = excluded.pacientes_nuevos,
       pacientes_activados = excluded.pacientes_activados,
       pacientes_activos = excluded.pacientes_activos,
       conversion_cohorte = excluded.conversion_cohorte,
       conversion_proyectada = excluded.conversion_proyectada,
       cohorte_edad_dias = excluded.cohorte_edad_dias,
       mediana_dias_compra = excluded.mediana_dias_compra,
       p80_dias_compra = excluded.p80_dias_compra,
       gasto_usd = excluded.gasto_usd,
       cac_usd = excluded.cac_usd,
       costo_por_registro_usd = excluded.costo_por_registro_usd,
       sesiones_por_paciente = excluded.sesiones_por_paciente,
       margen_usd_sesion = excluded.margen_usd_sesion,
       ltv_usd = excluded.ltv_usd,
       cohorte_cerrada = excluded.cohorte_cerrada,
       churn_rate = excluded.churn_rate,
       es_provisorio = excluded.es_provisorio,
       registros_tramo_previo = excluded.registros_tramo_previo,
       pacientes_nuevos_tramo_previo = excluded.pacientes_nuevos_tramo_previo,
       pacientes_activos_tramo_previo = excluded.pacientes_activos_tramo_previo,
       tramo_dias = excluded.tramo_dias,
       actualizado_en = now()`,
    [
      `${fila.mes}-01`,
      fila.pais,
      fila.plataforma,
      fila.registros,
      fila.pacientes_nuevos,
      fila.pacientes_activados,
      fila.pacientes_activos,
      fila.conversion_cohorte,
      fila.conversion_proyectada,
      fila.cohorte_edad_dias,
      fila.mediana_dias_compra,
      fila.p80_dias_compra,
      fila.gasto_usd,
      fila.cac_usd,
      fila.costo_por_registro_usd,
      fila.sesiones_por_paciente,
      fila.margen_usd_sesion,
      fila.ltv_usd,
      fila.cohorte_cerrada,
      fila.churn_rate,
      fila.es_provisorio,
      fila.registros_tramo_previo,
      fila.pacientes_nuevos_tramo_previo,
      fila.pacientes_activos_tramo_previo,
      fila.tramo_dias,
    ],
  );
}

async function leerMapping(db: Client): Promise<UtmMapping[]> {
  const { rows } = await db.query<UtmMapping>(
    "select patron, plataforma, superficie, es_pago, orden from marketing.utm_mapping",
  );
  return rows;
}

/** Values in force at the end of the month, not today's (METRICAS.md §3). */
async function leerParametros(
  db: Client,
  mes: string,
): Promise<Record<string, number>> {
  const { rows } = await db.query<{
    clave: string;
    pais: string;
    valor: string;
  }>(
    `select distinct on (clave, pais) clave, pais, valor
       from marketing.parametros
      where vigente_desde <= ($1::date + interval '1 month' - interval '1 day')
      order by clave, pais, vigente_desde desc`,
    [`${mes}-01`],
  );
  return Object.fromEntries(
    rows.map((r) => [`${r.clave}:${r.pais}`, Number(r.valor)]),
  );
}

/**
 * Spend is stored by week, so the month is a sum.
 *
 * A week belongs to the month its FIRST day falls in, never split across two.
 * The weeks start on Wednesdays, so many of them straddle a month boundary;
 * splitting them by days would be more precise in the abstract and would stop
 * matching the sheet this spend is planned in, which is the number anyone
 * would check it against.
 */
async function leerGastos(
  db: Client,
  mes: string,
): Promise<Record<string, number>> {
  const { rows } = await db.query<{ pais: string; monto_usd: string }>(
    `select pais, sum(monto_usd) as monto_usd
       from marketing.gastos
      where semana >= $1::date and semana < ($1::date + interval '1 month')
      group by pais`,
    [`${mes}-01`],
  );
  return Object.fromEntries(rows.map((r) => [r.pais, Number(r.monto_usd)]));
}

/** Current and previous month, in local time, as 'YYYY-MM'. */
export function mesesAEscribir(hoy = new Date()): string[] {
  const local = new Date(hoy.getTime() - 3 * 3600_000);
  const year = local.getUTCFullYear();
  const month = local.getUTCMonth();
  return [mesDe(year, month), mesDe(year, month - 1)];
}

export function mesActual(hoy = new Date()): string {
  return mesesAEscribir(hoy)[0]!;
}

function mesDe(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
