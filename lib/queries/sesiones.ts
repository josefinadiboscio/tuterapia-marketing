import type { Connection, RowDataPacket } from "mysql2/promise";
import { LOCAL_UTC_OFFSET_HOURS, type Rango } from "@/lib/queries/shared";

/**
 * Sesiones REALIZADAS por día, país y modalidad.
 *
 * Realizadas y no vendidas: una venta es un paquete de sesiones y cae entera
 * el día del pago, así que como serie diaria son picos y ceros. Lo que pasa
 * todos los días es la sesión que ocurre.
 *
 * `sesiones.tipo_session` es `enum('online','presencial')` y es **nullable**,
 * así que hay una tercera categoría de hecho. Se trae como `sin_dato` en vez
 * de descartarla: una sesión sin modalidad ocurrió igual, y si se filtrara el
 * total del gráfico no cerraría contra ningún otro número del dashboard.
 *
 * El país sale de `login`, porque `sesiones` no lo tiene. Es el mismo join que
 * usa `pacientesActivos`, así que las dos cuentan sobre la misma población.
 *
 * Una sola consulta agrupada por los tres ejes, no una por país: MySQL agrupa
 * y devuelve unas pocas cientos de filas ya reducidas. El job tiene 60
 * segundos y cada ida y vuelta cuenta.
 */
export type SesionPorDia = {
  dia: string;
  pais: string;
  modalidad: "online" | "presencial" | "sin_dato";
  sesiones: number;
};

export async function sesionesPorDiaYModalidad(
  conn: Connection,
  rango: Rango,
): Promise<SesionPorDia[]> {
  const [rows] = await conn.query<
    (RowDataPacket & {
      dia: string;
      pais: string;
      modalidad: string;
      sesiones: number;
    })[]
  >(
    `SELECT DATE(DATE_SUB(s.fecha, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR)) AS dia,
            l.paisDominio AS pais,
            COALESCE(s.tipo_session, 'sin_dato') AS modalidad,
            COUNT(*) AS sesiones
       FROM sesiones s
       JOIN login l ON l.id = s.id_paciente AND l.tipo = 1
      WHERE s.realizada = 1
        AND l.paisDominio IN ('AR', 'UY')
        AND s.fecha >= ? AND s.fecha < ?
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    [rango.start, rango.end],
  );

  return rows.map((r) => ({
    dia: String(r.dia).slice(0, 10),
    pais: String(r.pais),
    modalidad: r.modalidad as SesionPorDia["modalidad"],
    sesiones: Number(r.sesiones),
  }));
}
