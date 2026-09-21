import type { Connection, RowDataPacket } from "mysql2/promise";
import { LOCAL_UTC_OFFSET_HOURS, type Rango } from "@/lib/queries/shared";

/**
 * Sesiones VENDIDAS por día, país y modalidad.
 *
 * Vendidas, no realizadas: es la suma de `pacientes_pagos.sesiones` sobre los
 * pagos confirmados del día. Una venta es un paquete entero, así que cae
 * completa el día del pago — ocho sesiones compradas un martes son ocho
 * sesiones de ese martes. La serie diaria queda dentada a propósito: así es
 * como entra la plata.
 *
 * Un pago es venta solo si `confirmado = 1`, la misma regla que usa
 * `PRIMER_PAGO` en todo el resto del proyecto.
 *
 * La fecha es `creacion`, que es la que el proyecto usa para fechar un pago en
 * todos lados (PRIMER_PAGO, conversión, LTV). `pacientes_pagos` tiene además
 * una columna `fecha` sin documentar (METRICAS.md §9), y usarla acá haría que
 * esta serie fechara las ventas distinto que las demás pantallas.
 *
 * `tipo_session` es `enum('online','presencial')` y es **nullable**, así que
 * hay una tercera categoría de hecho. Se trae como `sin_dato` en vez de
 * filtrarla: esa venta existió, y descartarla haría que el total del gráfico
 * no cierre contra ningún otro número del dashboard.
 *
 * El país sale de `pacientes_pagos.paisDominio`, que es el del pago y el que
 * usan las consultas de precio. El join a `login` es solo para el filtro de
 * `tipo = 1`, que es la guarda estándar del proyecto contra cuentas de
 * terapeutas.
 */
export type VentaPorDia = {
  dia: string;
  pais: string;
  modalidad: "online" | "presencial" | "sin_dato";
  sesiones: number;
};

export async function sesionesVendidasPorDia(
  conn: Connection,
  rango: Rango,
): Promise<VentaPorDia[]> {
  const [rows] = await conn.query<
    (RowDataPacket & {
      dia: string;
      pais: string;
      modalidad: string;
      sesiones: number;
    })[]
  >(
    `SELECT DATE(DATE_SUB(p.creacion, INTERVAL ${LOCAL_UTC_OFFSET_HOURS} HOUR)) AS dia,
            p.paisDominio AS pais,
            COALESCE(p.tipo_session, 'sin_dato') AS modalidad,
            SUM(p.sesiones) AS sesiones
       FROM pacientes_pagos p
       JOIN login l ON l.id = p.id_paciente AND l.tipo = 1
      WHERE p.confirmado = 1
        AND p.sesiones > 0
        AND p.paisDominio IN ('AR', 'UY')
        AND p.creacion >= ? AND p.creacion < ?
      GROUP BY 1, 2, 3
      ORDER BY 1, 2, 3`,
    [rango.start, rango.end],
  );

  return rows.map((r) => ({
    dia: String(r.dia).slice(0, 10),
    pais: String(r.pais),
    modalidad: r.modalidad as VentaPorDia["modalidad"],
    sesiones: Number(r.sesiones),
  }));
}
