import { entero, porcentaje } from "@/lib/ui/format";
import type { Cohorte } from "@/lib/funnel-cohorte";

/**
 * El embudo, dibujado como embudo.
 *
 * Cada etapa es un trapecio cuyo ancho de arriba es la gente que llegó y el de
 * abajo la que pasa a la siguiente, así el angostamiento ES la caída y no una
 * decoración que la acompaña. Entre banda y banda queda el hueco donde se
 * escribe cuánta gente se perdió ahí.
 *
 * Los anchos son proporción pura, sin piso mínimo: una sexta sesión que
 * conserva el 8% se dibuja al 8%. Ponerle un ancho mínimo para que entre el
 * texto sería dibujar un embudo más amable que el real, así que cuando la
 * banda es muy angosta lo que se mueve es la etiqueta, no la banda.
 *
 * Escrito con una clase literal por etapa porque Tailwind lee el fuente como
 * texto: una clase armada con template literal nunca llega a la hoja de
 * estilo.
 */
const RELLENO = [
  "fill-e0",
  "fill-e1",
  "fill-e2",
  "fill-e3",
  "fill-e4",
  "fill-e5",
  "fill-e6",
];

/**
 * De qué color va el texto adentro de cada banda.
 *
 * Las tres primeras son naranja y dorado claro: ahí el texto va oscuro. De la
 * tercera en adelante el teal es profundo y va claro. Está escrito a mano
 * porque es una decisión de contraste, y calcularlo con una fórmula de
 * luminancia daría lo mismo pero escondería que alguien lo miró.
 */
const TEXTO_ADENTRO = [
  "fill-[#3d2a17]",
  "fill-[#3d2a17]",
  "fill-[#3d2a17]",
  "fill-[#10312f]",
  "fill-[#f4efe2]",
  "fill-[#f4efe2]",
  "fill-[#f4efe2]",
];

/** Por debajo de esta fracción del ancho, la etiqueta no entra adentro. */
const ANCHO_MINIMO_TEXTO = 0.34;

const ALTO_BANDA = 52;
const ALTO_HUECO = 30;

export function Embudo({ cohorte }: { cohorte: Cohorte }) {
  const base = cohorte.n;

  return (
    <div className="flex-1">
      {cohorte.etapas.map((etapa, i) => {
        const siguiente = cohorte.etapas[i + 1];
        const tramo = cohorte.tramos[i];

        // El ancho de abajo es el de la etapa siguiente. En la última no hay
        // siguiente dibujada, así que la banda cierra recta: no sabemos —y no
        // mostramos— qué pasa después de la sexta.
        const arriba = fraccion(etapa.llegaron, base);
        const abajo =
          siguiente === undefined
            ? arriba
            : fraccion(siguiente.llegaron ?? etapa.llegaron, base);

        return (
          <div key={etapa.nro}>
            <div className="flex items-stretch gap-3">
              <div className="relative flex-1" style={{ height: ALTO_BANDA }}>
                <Banda
                  arriba={arriba}
                  abajo={abajo}
                  relleno={RELLENO[i]!}
                  textoAdentro={TEXTO_ADENTRO[i]!}
                  etiqueta={etapa.etiqueta}
                  cantidad={etapa.llegaron}
                  faltanDias={etapa.faltanDias}
                />
              </div>

              {/* El % vive afuera de la banda, en una columna propia: adentro
                  competiría con la cantidad justo donde la banda se angosta. */}
              <div
                className="flex w-14 shrink-0 items-center justify-end text-xs tabular-nums text-sec"
                style={{ height: ALTO_BANDA }}
              >
                {etapa.pctDelTotal === null ? "" : porcentaje(etapa.pctDelTotal, 0)}
              </div>
            </div>

            {tramo === undefined ? null : (
              <div
                className="flex items-center justify-center gap-1.5 text-[11px] tabular-nums"
                style={{ height: ALTO_HUECO }}
              >
                {tramo.perdidos === null ? (
                  <span className="text-ter">
                    faltan {tramo.faltanDias} días
                  </span>
                ) : (
                  <>
                    <span className="text-coral">−{entero(tramo.perdidos)}</span>
                    <span className="text-ter">
                      {tramo.pctCaida === null
                        ? ""
                        : porcentaje(tramo.pctCaida, 0)}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Una banda.
 *
 * SVG con `preserveAspectRatio="none"` y viewBox de 100×100: el trapecio se
 * estira al ancho que haya sin que yo tenga que saber cuánto mide. El texto va
 * en el mismo SVG para que quede centrado sobre la banda, con `font-size` en
 * unidades del viewBox estirado —por eso se escala en Y y no en X, y por eso
 * el alto del viewBox es 100 fijo.
 */
function Banda({
  arriba,
  abajo,
  relleno,
  textoAdentro,
  etiqueta,
  cantidad,
  faltanDias,
}: {
  arriba: number;
  abajo: number;
  relleno: string;
  textoAdentro: string;
  etiqueta: string;
  cantidad: number | null;
  faltanDias: number | null;
}) {
  const puntos = [
    `${50 - (arriba * 100) / 2},0`,
    `${50 + (arriba * 100) / 2},0`,
    `${50 + (abajo * 100) / 2},100`,
    `${50 - (abajo * 100) / 2},100`,
  ].join(" ");

  // El texto entra adentro si la banda es ancha en su punto medio, que es
  // donde el texto realmente está.
  const medio = (arriba + abajo) / 2;
  const adentro = cantidad !== null && medio >= ANCHO_MINIMO_TEXTO;

  return (
    <>
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon
          points={puntos}
          className={cantidad === null ? "fill-none stroke-borde" : relleno}
          strokeDasharray={cantidad === null ? "4 3" : undefined}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="absolute inset-0 flex items-center justify-center">
        {cantidad === null ? (
          <span className="text-[11px] text-ter">
            {etiqueta} · faltan {faltanDias} días
          </span>
        ) : adentro ? (
          <span className={`flex items-baseline gap-2 text-xs ${claseTexto(textoAdentro)}`}>
            <span>{etiqueta}</span>
            <span className="tabular-nums">{entero(cantidad)}</span>
          </span>
        ) : (
          // La banda no da para el texto: se escribe al lado, no se ensancha
          // la banda.
          <span className="flex items-baseline gap-2 text-xs text-texto">
            <span>{etiqueta}</span>
            <span className="tabular-nums">{entero(cantidad)}</span>
          </span>
        )}
      </div>
    </>
  );
}

/**
 * El mismo color, como texto en vez de como relleno.
 *
 * Las clases están escritas enteras en las dos formas, sin construirlas, por
 * el mismo motivo que la rampa: Tailwind necesita verlas en el fuente.
 */
function claseTexto(relleno: string): string {
  return relleno === "fill-[#3d2a17]"
    ? "text-[#3d2a17]"
    : relleno === "fill-[#10312f]"
      ? "text-[#10312f]"
      : "text-[#f4efe2]";
}

function fraccion(valor: number | null, base: number): number {
  if (valor === null || base <= 0) return 0;
  return Math.max(0, Math.min(1, valor / base));
}
