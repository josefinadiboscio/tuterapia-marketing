import type { Connection } from "mysql2/promise";
import type { Client } from "pg";
import { transaction } from "@/lib/db";
import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";
import {
  etapasPorDiaDeCompra,
  tiemposPorDiaDeCompra,
} from "@/lib/queries/funnel";

/**
 * The funnel aggregates, rebuilt over a moving window of purchase days.
 *
 * This is the one place that breaks the "never recalculate a closed month"
 * rule, and it has to: a cohort of buyers keeps moving forever. Somebody who
 * bought in March can do their sixth session in September, so March's row is
 * different tonight than it was last night. Writing only the current month
 * would freeze every cohort at the shape it had the day it closed.
 *
 * The window is two years and a month because the screen compares a period
 * against the previous one of the same length: a 365-day period needs 730 days
 * of history behind it, plus a margin.
 *
 * Cheap despite the length: a day has a handful of buyers, so the whole window
 * is tens of thousands of rows, all of them aggregated on the MySQL side.
 */
export const DIAS_DE_FUNNEL = 760;

export async function sincronizarFunnel(
  mysql: Connection,
  db: Client,
  dias = DIAS_DE_FUNNEL,
  ahora = new Date(),
): Promise<number> {
  const desde = diaLocalMenos(dias, ahora);
  // MySQL filters on the UTC instant, and the local day starts three hours
  // later in UTC. Whoever bought at 22:00 local on the first day of the
  // window is in it.
  const desdeUtc = `${desde} ${String(LOCAL_UTC_OFFSET_HOURS).padStart(2, "0")}:00:00`;

  const [etapas, tiempos] = await Promise.all([
    etapasPorDiaDeCompra(mysql, desdeUtc),
    tiemposPorDiaDeCompra(mysql, desdeUtc),
  ]);

  return transaction(db, async () => {
    // Replace rather than upsert: a patient can only ever move forward, but a
    // stage row that was written once and is no longer produced — a refund
    // that unconfirmed a payment — would otherwise stay there for good.
    await db.query("delete from marketing.funnel_etapas where fecha_compra >= $1", [
      desde,
    ]);
    await db.query("delete from marketing.funnel_tiempos where fecha_compra >= $1", [
      desde,
    ]);

    await insertarEtapas(db, etapas);
    await insertarTiempos(db, tiempos);

    return etapas.length + tiempos.length;
  });
}

/** Postgres takes about 65k parameters; these chunks stay far below that. */
const LOTE = 2_000;

async function insertarEtapas(
  db: Client,
  filas: { fecha: string; pais: string; nro_sesion: number; pacientes: number }[],
): Promise<void> {
  for (const lote of enLotes(filas, LOTE)) {
    await db.query(
      `insert into marketing.funnel_etapas
         (fecha_compra, pais, nro_sesion, pacientes)
       select * from unnest($1::date[], $2::text[], $3::int[], $4::int[])`,
      [
        lote.map((f) => f.fecha),
        lote.map((f) => f.pais),
        lote.map((f) => f.nro_sesion),
        lote.map((f) => f.pacientes),
      ],
    );
  }
}

async function insertarTiempos(
  db: Client,
  filas: {
    fecha: string;
    pais: string;
    tramo: number;
    dias: number;
    pacientes: number;
  }[],
): Promise<void> {
  for (const lote of enLotes(filas, LOTE)) {
    await db.query(
      `insert into marketing.funnel_tiempos
         (fecha_compra, pais, tramo, dias, pacientes)
       select * from unnest($1::date[], $2::text[], $3::int[], $4::int[], $5::int[])`,
      [
        lote.map((f) => f.fecha),
        lote.map((f) => f.pais),
        lote.map((f) => f.tramo),
        lote.map((f) => f.dias),
        lote.map((f) => f.pacientes),
      ],
    );
  }
}

function* enLotes<T>(filas: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < filas.length; i += tamano) {
    yield filas.slice(i, i + tamano);
  }
}

/** The local calendar day `dias` days back, as YYYY-MM-DD. */
function diaLocalMenos(dias: number, ahora: Date): string {
  const local = new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000);
  local.setUTCDate(local.getUTCDate() - dias);
  return local.toISOString().slice(0, 10);
}
