import type { Connection } from "mysql2/promise";
import type { Client } from "pg";
import { PAISES, monthRangeUtc, type Pais } from "@/lib/queries/shared";
import { registrosYTerapeutaPorMes } from "@/lib/queries/registros";

/**
 * Quién escribe `metricas_mensuales.eligieron_terapeuta`, y por qué no el sync.
 *
 * Esta métrica rompe la regla de "nunca recalcular un mes cerrado", y la rompe
 * por la misma razón que el funnel sobre compradores (METRICAS.md §8): no es un
 * hecho del mes, es un estado de hoy. `pacientes.id_terapeuta` no tiene fecha
 * propia, así que la cohorte de octubre sigue subiendo durante todo noviembre.
 * Un valor escrito una vez y nunca más queda clavado donde estaba.
 *
 * Y el sync nocturno no puede hacerse cargo. Medido el 2026-10-26: escribe el
 * mes en curso a los 44 segundos y lo matan a los 60 antes de llegar al mes
 * anterior —en `marketing.sync_log` las corridas de `/api/cron/sync` figuran
 * "sin terminar" todas las noches—, así que justamente el mes que esta métrica
 * necesita releer es el que ese job nunca vuelve a tocar.
 *
 * Son dos consultas, una por país, y la ventana entera en cada una. Van colgadas
 * del cron del funnel, que cierra en cuatro segundos y tiene cincuenta y seis
 * libres, en vez de sumar carga a uno que ya se pasa del techo.
 */

/**
 * Cuántos meses se reescriben en cada corrida.
 *
 * General muestra como mucho doce, así que trece cubre todo lo que se puede
 * mirar y deja uno de margen. Reescribir de más no cuesta: es la misma consulta
 * agrupada, y los meses viejos ya no se mueven.
 */
export const MESES_DE_TERAPEUTA = 13;

export async function sincronizarTerapeuta(
  mysql: Connection,
  db: Client,
  meses = MESES_DE_TERAPEUTA,
  ahora = new Date(),
): Promise<number> {
  const desde = mesesAtras(mesLocal(ahora), meses - 1);
  const rango = {
    start: monthRangeUtc(desde).start,
    end: monthRangeUtc(mesLocal(ahora)).end,
  };

  // Por mes, los dos países y el TOTAL. El TOTAL se arma sumando los crudos y
  // no promediando dos partes: una parte no se promedia con otra.
  const total = new Map<string, { registros: number; conTerapeuta: number }>();
  let escritas = 0;

  for (const pais of PAISES as readonly Pais[]) {
    const filas = await registrosYTerapeutaPorMes(mysql, rango, pais);

    for (const f of filas) {
      escritas += await guardar(db, f.mes, pais, f.conTerapeuta);
      let acc = total.get(f.mes);
      if (!acc) {
        acc = { registros: 0, conTerapeuta: 0 };
        total.set(f.mes, acc);
      }
      acc.registros += f.registros;
      acc.conTerapeuta += f.conTerapeuta;
    }
  }

  for (const [mes, v] of total) {
    escritas += await guardar(db, mes, "TOTAL", v.conTerapeuta);
  }

  return escritas;
}

/**
 * Un UPDATE de una sola columna, nunca un upsert.
 *
 * La fila la crea el sync mensual con sus treinta y pico de columnas. Si acá se
 * insertara, un mes que el sync todavía no escribió aparecería con todo en null
 * menos esta columna, y la pantalla lo dibujaría como un mes sin registros.
 * Si la fila no está, no hay nada que actualizar y la corrida sigue.
 */
async function guardar(
  db: Client,
  mes: string,
  pais: string,
  eligieron: number,
): Promise<number> {
  const { rowCount } = await db.query(
    `update marketing.metricas_mensuales
        set eligieron_terapeuta = $3, actualizado_en = now()
      where mes = $1 and pais = $2 and plataforma = 'TODAS'`,
    [`${mes}-01`, pais, eligieron],
  );
  return rowCount ?? 0;
}

/** 'YYYY-MM' del mes en curso, en día local (UTC−3). */
function mesLocal(ahora: Date): string {
  return new Date(ahora.getTime() - 3 * 3_600_000).toISOString().slice(0, 7);
}

function mesesAtras(mes: string, n: number): string {
  const [year, month] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
