import { GraficoSerie, type Serie } from "@/components/grafico-serie";
import { identidadDe } from "@/components/identidad";
import { entero, porcentaje, mesCorto } from "@/lib/ui/format";
import {
  armarTerapeuta,
  DIAS_PARA_ELEGIR,
  type MesTerapeuta,
} from "@/lib/terapeuta";
import type { MesSerie } from "@/lib/dashboard";

/**
 * El registro, partido en los que llegaron a elegir terapeuta y los que no.
 *
 * Va entre sesiones vendidas y economía porque es el paso que faltaba:
 * arriba está cuánta gente entra, abajo cuánto cuesta, y en el medio no había
 * nada sobre dónde se va la mayoría. El Funnel empieza en la compra, así que
 * este tramo —registro → terapeuta → compra— no estaba en ninguna pantalla.
 *
 * La barra entera son los registros del mes, el mismo número que muestra la
 * card de Registros de arriba, porque sale de la misma fila de
 * `marketing.metricas_mensuales`. Partirla no agrega una fuente nueva.
 *
 * Es el mismo gráfico apilado que usa el bloque de Volumen, con su panel de
 * composición al costado: ahí están los dos números y las dos partes del mes
 * que se esté mirando.
 */
export function SeccionTerapeuta({
  serie,
  pais,
}: {
  serie: MesSerie[];
  pais: string;
}) {
  const vista = armarTerapeuta(serie);
  if (vista.meses.length === 0) return null;

  // Dos series, dos colores distintos y no el mismo atenuado: el panel del
  // costado pinta su cuadradito con el relleno de la serie y no sabe de
  // atenuaciones, así que dos series del mismo color serían dos filas con el
  // mismo cuadradito.
  const series: Serie[] = [
    {
      nombre: "Eligió terapeuta",
      trazo: "stroke-orange",
      relleno: "fill-orange",
      puntos: vista.meses.map((m) => ({
        mes: m.mes,
        valor: m.eligieron,
        enCurso: !m.madura,
      })),
    },
    {
      nombre: "Sin terapeuta",
      trazo: "stroke-dim",
      relleno: "fill-dim",
      puntos: vista.meses.map((m) => ({
        mes: m.mes,
        valor: m.sinTerapeuta,
        enCurso: !m.madura,
      })),
    },
  ];

  return (
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wide text-ter">
        Registros que eligieron terapeuta
      </h2>

      <GraficoSerie
        series={series}
        tipo="barras"
        formatoId="entero"
        identidad={identidadDe(pais)}
        apiladas
        leyendaEnCurso="sin terminar"
      />

      <Lectura vista={vista} />
    </section>
  );
}

/**
 * Qué dice el pie: el último mes que terminó de elegir, su movimiento, y
 * cuáles de las barras todavía están en curso.
 *
 * El movimiento se mide entre dos meses MADUROS. Comparar octubre a mitad de
 * camino contra septiembre cerrado daría una caída de treinta puntos que es
 * solo la edad de la cohorte, y es exactamente el número que alguien
 * repetiría en una reunión.
 */
function Lectura({ vista }: { vista: ReturnType<typeof armarTerapeuta> }) {
  const { ultimaMadura, previaMadura, inmaduras } = vista;

  return (
    <div className="mt-3 space-y-1 text-sm">
      {ultimaMadura === null ? null : (
        <p className="text-texto">
          En {mesCorto(ultimaMadura.mes)}, {entero(ultimaMadura.eligieron)} de{" "}
          {entero(ultimaMadura.registros)} registros llegaron a elegir terapeuta
          — {porcentaje(ultimaMadura.parte)}. Los otros{" "}
          {entero(ultimaMadura.sinTerapeuta)} no pasaron de ahí
          {previaMadura === null ? (
            "."
          ) : (
            <>
              , y la parte que elige viene de{" "}
              {porcentaje(previaMadura.parte)} en{" "}
              {mesCorto(previaMadura.mes)}.
            </>
          )}
        </p>
      )}

      {inmaduras.length === 0 ? null : (
        <p className="text-sec">
          {inmaduras.map((m) => etiquetaInmadura(m)).join(" · ")}:{" "}
          {inmaduras.length === 1 ? "cohorte" : "cohortes"} sin terminar de
          elegir. Una cohorte tarda unos {DIAS_PARA_ELEGIR} días en cerrar esta
          parte, así que estas barras van a subir y no se comparan con las de
          atrás.
        </p>
      )}
    </div>
  );
}

/**
 * "oct · en curso" o "sep · cerró hace 5 días".
 *
 * La edad va al lado, como las cohortes proyectadas del funnel, pero no para
 * el mes que está corriendo: ahí la cuenta da cero —el mes todavía no
 * terminó— y "oct · 0 días" se lee como un error de cálculo en vez de como
 * un mes a medio andar.
 */
function etiquetaInmadura(m: MesTerapeuta): string {
  if (m.edadDias === 0) return `${mesCorto(m.mes)} · en curso`;
  const dias = `${m.edadDias} ${m.edadDias === 1 ? "día" : "días"}`;
  return `${mesCorto(m.mes)} · cerró hace ${dias}`;
}
