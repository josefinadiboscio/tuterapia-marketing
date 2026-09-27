import { DeltaPp } from "@/components/delta-pp";
import type { NoVuelven } from "@/lib/funnel";
import type { SesionesHistorico } from "@/lib/dashboard";
import {
  decimal,
  entero,
  mesCorto,
  porcentaje,
  delta as fmtDelta,
} from "@/lib/ui/format";

/**
 * La fila de cards que abre el Funnel.
 *
 * Cuatro números que se leen en orden y cuentan una sola historia: cuánta
 * gente compró en el período, cuánta se bajó después de la primera sesión,
 * cuánta después de la segunda, y cuántas sesiones termina haciendo un
 * paciente cuando se lo mira de por vida.
 *
 * Ninguna de las cuatro calcula nada: las tres primeras son filas de la tabla
 * de abajo y la cuarta es la columna que ya muestra General. Si un número
 * aparece en dos lugares, sale del mismo lugar.
 */

/** Los compradores del período, contra el período anterior del mismo largo. */
export function CardCompradores({
  compradores,
  delta,
}: {
  compradores: number;
  delta: number | null;
}) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">Compradores del período</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl text-texto">{entero(compradores)}</span>
        {delta === null ? null : (
          <span
            className={`text-xs ${delta >= 0 ? "text-green" : "text-ambar"}`}
          >
            {fmtDelta(delta, 0)}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Cuánta gente terminó su terapia en la sesión N.
 *
 * Una card por etapa, con la misma regla: la cantidad de personas, el
 * porcentaje sobre los compradores que ya tuvieron tiempo de contestar la
 * pregunta, el delta en puntos contra el período anterior, y debajo sobre
 * cuántos se calcula y hasta qué día de compra llega.
 *
 * El corte es propio de cada etapa y por eso la base cambia entre las dos:
 * para saber si alguien se quedó en la segunda hay que darle tiempo a una
 * tercera. Un corte único para las dos sería más prolijo y estaría mal.
 */
export function CardNoVuelven({ nv }: { nv: NoVuelven }) {
  return (
    <div className="rounded-lg border border-borde bg-surface px-4 py-3">
      <p className="text-xs text-sec">No vuelven tras la {nv.ordinal}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl text-texto">{entero(nv.personas)}</span>
        <span className="text-sm text-sec">{porcentaje(nv.pct)}</span>
        <span className="whitespace-nowrap text-xs">
          <DeltaPp valor={nv.deltaPp} conUnidad />
        </span>
      </p>
      <p className="mt-0.5 text-[11px] text-ter">
        sobre {entero(nv.base)} compradores, hasta compras del{" "}
        <span className="whitespace-nowrap">{nv.hasta}</span>
      </p>
    </div>
  );
}

/**
 * Cuántas sesiones hace un paciente a lo largo de toda su vida.
 *
 * Es el mismo número de la card "Sesiones por paciente" de General, leído de
 * la misma columna de `marketing.metricas_mensuales`. Está acá porque es el
 * final de la historia que cuenta el resto de la pestaña: las dos cards de al
 * lado dicen cuánta gente se baja temprano, y esta dice dónde termina el
 * promedio cuando se cuenta a todos.
 *
 * Dos avisos que la card tiene que dar, porque rompe las reglas de las otras
 * tres: no se recorta por el período elegido —es de por vida, sobre la base
 * entera— y en TOTAL no se promedia. Un paciente uruguayo se queda cerca de
 * una vez y media más que un argentino, así que el promedio de los dos no
 * describe a ninguno de los dos mercados.
 */
export function CardSesionesPorPaciente({
  historico,
}: {
  historico: SesionesHistorico;
}) {
  const p = historico.principal;
  if (!p || p.valor === null) return null;

  const meses =
    p.mesActual && p.mesPrevio
      ? `${mesCorto(p.mesActual)} vs. ${mesCorto(p.mesPrevio)}`
      : null;

  return (
    <div
      className="rounded-lg border border-borde bg-surface px-4 py-3"
      title="Sesiones realizadas que hace un paciente a lo largo de toda su vida en Tu Terapia, sobre todos los que hicieron al menos una. No se recorta por el período elegido."
    >
      <p className="text-xs text-sec">Sesiones por paciente</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl text-texto">{decimal(p.valor)}</span>
        <DeltaSesiones delta={p.delta} />
      </p>
      {/* En TOTAL el segundo país va abajo y no al lado, como en General: los
          dos números más el delta no entran en un cuarto de fila y el que se
          cortaba era justo el delta. */}
      {historico.otro && historico.otro.valor !== null ? (
        <p className="mt-0.5 text-xs text-sec">
          {p.pais} · {historico.otro.pais} {decimal(historico.otro.valor)}
        </p>
      ) : null}
      <p className="mt-0.5 text-[11px] text-ter">
        de por vida, toda la base · ajena al período
      </p>
      {/* Los dos meses en su propio renglón: pegados al aviso de arriba, la
          línea se parte y "jul" queda solo abajo. Y tienen que estar, porque
          el número grande es el del mes en curso y el delta compara los dos
          cerrados anteriores — sin nombrarlos parecería hablar del 8,7. */}
      {meses ? <p className="text-[11px] text-ter">{meses}</p> : null}
    </div>
  );
}

/**
 * El movimiento contra el mes cerrado anterior, en sesiones crudas.
 *
 * Crudo y no en porcentaje: esto se arrastra de a décimas, y "+1,2%" sobre 8,7
 * suena a un cambio que no pasó. Es la misma regla que `deltaEnBruto` en
 * General, umbral incluido, así que las dos pestañas dicen lo mismo.
 *
 * Lleva flecha, y la flecha no es decoración. Un "−0,2" solo, al lado de dos
 * cards que dicen "+3,8 pp" y "+2,1 pp", no se lee como un delta: se lee como
 * un decimal más del 8,7 que tiene al lado. Y más sesiones por paciente es
 * mejor —al revés que las dos cards de la izquierda, donde el verde es el
 * número que baja—, así que sin flecha hay que saber de antemano de qué lado
 * está el bien.
 *
 * Y por debajo de media décima dice "igual" en vez de callarse: en Uruguay el
 * movimiento real es de tres centésimas, y un hueco ahí se lee como un dato
 * que falta y no como uno que no se movió.
 */
function DeltaSesiones({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  if (Math.abs(delta) < 0.05) {
    return <span className="whitespace-nowrap text-xs text-sec">→ igual</span>;
  }
  const sube = delta > 0;
  return (
    <span
      className={`whitespace-nowrap text-xs ${sube ? "text-green" : "text-coral"}`}
    >
      {sube ? "↑ +" : "↓ −"}
      {Math.abs(delta).toFixed(1).replace(".", ",")}
    </span>
  );
}
