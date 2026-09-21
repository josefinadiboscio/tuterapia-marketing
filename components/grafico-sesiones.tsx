import { entero, mesCorto } from "@/lib/ui/format";
import { ETIQUETA_SEGMENTO, RELLENO_SEGMENTO } from "@/lib/sesiones-ui";
import type { VistaSesiones } from "@/lib/sesiones";

/**
 * Sesiones vendidas por día, apiladas por país y modalidad.
 *
 * Quince barras, alineadas con el gráfico de pacientes nuevos de arriba para
 * que las dos series se puedan leer una contra otra sin recalibrar el ojo.
 *
 * La serie es dentada a propósito: una venta es un paquete entero que cae el
 * día del pago. Por eso no hay media móvil — suavizarla escondería justo lo
 * que la serie tiene para decir, que es cuándo entra la plata.
 *
 * El total va arriba de cada barra. Sin eso el gráfico no tiene ninguna forma
 * de leer un valor: no hay eje ni grilla, igual que el de arriba.
 */
const ALTO = 120;
const ANCHO = 1100;

export function GraficoSesiones({ vista }: { vista: VistaSesiones }) {
  const { barras, claves } = vista;

  if (barras.every((b) => b.total === 0)) {
    return (
      <p className="mt-3 text-sm text-sec">
        Todavía no hay ventas sincronizadas. El job las escribe junto con el
        grano diario.
      </p>
    );
  }

  const maximo = Math.max(...barras.map((b) => b.total), 1);
  const paso = ANCHO / barras.length;
  const anchoBarra = Math.min(paso * 0.6, 34);

  return (
    <figure className="mt-3">
      {/* Igual que el de arriba, el viewBox arranca en −14 para que la
          etiqueta de la barra más alta no quede cortada por el borde. */}
      <svg
        viewBox={`0 -14 ${ANCHO} ${ALTO + 36}`}
        className="h-[156px] w-full"
      >
        {barras.map((barra, i) => {
          const centro = i * paso + paso / 2;
          let acumulado = 0;
          return (
            <g key={barra.fecha}>
              {claves.map((clave) => {
                const valor = barra.segmentos.get(clave) ?? 0;
                if (valor === 0) return null;
                const base = ALTO - (acumulado / maximo) * ALTO;
                acumulado += valor;
                const tope = ALTO - (acumulado / maximo) * ALTO;
                return (
                  <rect
                    key={clave}
                    x={centro - anchoBarra / 2}
                    y={tope}
                    width={anchoBarra}
                    height={Math.max(base - tope, 0)}
                    className={RELLENO_SEGMENTO[clave] ?? "fill-ses-nd"}
                  />
                );
              })}
            </g>
          );
        })}

        {barras.map((barra, i) =>
          barra.total === 0 ? null : (
            <text
              key={`n-${barra.fecha}`}
              x={i * paso + paso / 2}
              y={ALTO - (barra.total / maximo) * ALTO - 4}
              textAnchor="middle"
              className="fill-ter text-[10px]"
            >
              {entero(barra.total)}
            </text>
          ),
        )}

        {barras.map((barra, i) => (
          <text
            key={`f-${barra.fecha}`}
            x={i * paso + paso / 2}
            y={ALTO + 14}
            textAnchor="middle"
            className="fill-ter text-[10px]"
          >
            {Number(barra.fecha.slice(8))}
            {barra.fecha.slice(8) === "01" || i === 0
              ? ` ${mesCorto(barra.fecha.slice(0, 7))}`
              : ""}
          </text>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-sec">
        {claves.map((clave) => (
          <span key={clave} className="flex items-center gap-1.5">
            <span
              className={`inline-block h-2 w-2 rounded-sm ${
                (RELLENO_SEGMENTO[clave] ?? "fill-ses-nd").replace("fill-", "bg-")
              }`}
            />
            {ETIQUETA_SEGMENTO(clave)}
          </span>
        ))}
        <span className="text-ter">máximo {entero(maximo)} por día</span>
      </div>
    </figure>
  );
}
