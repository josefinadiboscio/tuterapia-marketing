import { entero, porcentaje, nombreDeMes } from "@/lib/ui/format";
import { ETIQUETA_SEGMENTO, RELLENO_SEGMENTO } from "@/lib/sesiones-ui";
import type { VistaSesiones } from "@/lib/sesiones";

/**
 * El mes de ventas, al lado del gráfico.
 *
 * Tres cosas, en orden de qué se pregunta primero: cuánto va del mes contra
 * cómo venía el anterior, de qué está hecho, y dónde termina.
 */
export function PanelSesiones({
  vista,
  mes,
}: {
  vista: VistaSesiones;
  mes: string;
}) {
  const {
    delMes,
    delMesPrevio,
    cierrePrevio,
    partes,
    proyeccion,
    diaDelMes,
    diasDelMes,
    proyeccionLineal,
  } = vista;

  const delta =
    delMesPrevio > 0 ? delMes / delMesPrevio - 1 : null;
  const contraCierre =
    cierrePrevio > 0 ? proyeccion / cierrePrevio - 1 : null;

  /*
   * La barra se escala al MAYOR entre la proyección y el cierre anterior.
   *
   * Escalarla a la proyección sola parece más simple y miente cuando el mes
   * anterior cerró más alto: la marca de referencia se clava en el extremo y
   * el mes parece empatar con el anterior cuando en realidad viene abajo. Que
   * es exactamente el caso de septiembre contra agosto.
   *
   * Sólido es lo vendido, claro es lo que falta para llegar a la proyección, y
   * la marca es el cierre del mes anterior — la barra a superar.
   */
  const escala = Math.max(proyeccion, cierrePrevio, 1);
  const avance = Math.min(1, delMes / escala);
  const avanceProyectado = Math.min(1, proyeccion / escala);
  const avanceCierre = cierrePrevio > 0 ? Math.min(1, cierrePrevio / escala) : null;

  return (
    <aside className="rounded-lg border border-borde bg-surface px-4 py-3 lg:w-[340px] lg:shrink-0">
      <p className="text-xs uppercase tracking-wide text-ter">
        {nombreDeMes(mes)}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl text-texto">{entero(delMes)}</span>
        {delta === null ? null : (
          <span
            className={`text-xs ${
              Math.abs(delta) < 0.005
                ? "text-sec"
                : delta > 0
                  ? "text-green"
                  : "text-coral"
            }`}
          >
            {Math.abs(delta) < 0.005
              ? "→ igual"
              : `${delta > 0 ? "↑ +" : "↓ −"}${Math.abs(delta * 100).toFixed(0)}%`}
          </span>
        )}
      </p>
      {/* Los mismos días del mes anterior, no el mes entero: medio septiembre
          contra todo agosto dice que el mes se derrumbó, y eso solo es cierto
          del calendario. */}
      <p className="mt-0.5 text-[11px] text-ter">
        sesiones vendidas · vs. {entero(delMesPrevio)} en los mismos{" "}
        {diaDelMes} días del mes anterior
      </p>

      <div className="mt-4 space-y-2">
        {partes.map((p) => {
          const clave = `${p.pais}·${p.modalidad}`;
          return (
            <div key={clave}>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`inline-block h-2 w-2 shrink-0 rounded-sm ${
                      (RELLENO_SEGMENTO[clave] ?? "fill-ses-nd").replace(
                        "fill-",
                        "bg-",
                      )
                    }`}
                  />
                  <span className="truncate text-texto">
                    {ETIQUETA_SEGMENTO(clave)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-sec">
                  {entero(p.sesiones)}
                  <span className="ml-1.5 text-ter">
                    {porcentaje(p.parte, 0)}
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-sm bg-surface-2">
                <div
                  className={`h-1.5 rounded-sm ${
                    (RELLENO_SEGMENTO[clave] ?? "fill-ses-nd").replace(
                      "fill-",
                      "bg-",
                    )
                  }`}
                  style={{ width: `${Math.max(1, p.parte * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 border-t border-borde pt-3">
        <p className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-ter">Proyección a fin de mes</span>
          <span className="tabular-nums text-texto">{entero(proyeccion)}</span>
        </p>

        {/* La barra lleva la marca del cierre anterior encima: sin una
            referencia, un número proyectado no dice si el mes va bien. */}
        <div className="relative mt-2 h-2.5 w-full rounded-sm bg-surface-2">
          {/* Lo que falta para la proyección, en claro y por debajo. */}
          <div
            className="absolute inset-y-0 left-0 rounded-sm bg-ses-ar-pre"
            style={{ width: `${avanceProyectado * 100}%` }}
          />
          {/* Lo vendido, en sólido y encima. */}
          <div
            className="absolute inset-y-0 left-0 rounded-sm bg-ses-ar-on"
            style={{ width: `${avance * 100}%` }}
          />
          {avanceCierre === null ? null : (
            <div
              className="absolute top-[-3px] h-[16px] w-px bg-texto"
              style={{ left: `${avanceCierre * 100}%` }}
              title={`Cierre del mes anterior: ${entero(cierrePrevio)}`}
            />
          )}
        </div>

        <p className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-ter">
          <span>
            {entero(delMes)} vendidas · día {diaDelMes} de {diasDelMes}
          </span>
          <span>
            cierre anterior {entero(cierrePrevio)}
            {contraCierre === null
              ? ""
              : ` · ${contraCierre >= 0 ? "+" : "−"}${Math.abs(contraCierre * 100).toFixed(0)}%`}
          </span>
        </p>

        {/* Qué método se usó, porque cambia cuánto creerle. */}
        <p className="mt-2 text-[11px] text-ter">
          {proyeccionLineal
            ? "Proyección lineal: todavía no hay suficientes semanas completas para el patrón semanal."
            : "Proyectado con el peso real de cada día de la semana. Un sábado vende alrededor de un cuarto de lo que vende un lunes, así que los días que faltan no valen todos lo mismo."}
        </p>
      </div>
    </aside>
  );
}
