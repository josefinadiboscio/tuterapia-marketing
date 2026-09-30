"use client";

import { useEffect, useRef } from "react";

/**
 * La planta del header, parada sobre la línea de las pestañas.
 *
 * Reemplaza a los cuatro dibujitos. Es un SVG y no un PNG por una razón
 * concreta además de que se mueve: las mascotas estaban dibujadas en azul
 * marino y el modo oscuro las rescataba con un `filter: invert(1)
 * hue-rotate(180deg)` en el CSS. Un trazo que toma su color de un token no
 * necesita ese truco.
 *
 * Casi todo el tiempo está meditando o parada. Caminar es lo que menos hace, y
 * cuando lo hace da unos pasos cortos dentro de su rincón: el tramo entero que
 * recorre entra en el ancho que ocupaban los cuatro dibujitos. Una cosa que se
 * desplaza por el header de una pantalla donde se trabaja todos los días cansa
 * a los dos días.
 *
 * Todo el movimiento se escribe directo sobre el DOM desde un
 * requestAnimationFrame, no a través del estado de React: son sesenta cuadros
 * por segundo y un re-render por cuadro sería absurdo. React solo monta esto
 * una vez.
 */

/** Cada cuánto habla. */
const CADA_MS = 90_000;
/** Cuánto queda el globo en pantalla. */
const GLOBO_MS = 6_000;
/** Fracción del carril por milisegundo, cuando camina. */
const VELOCIDAD = 0.00055;

type Estado = "quieta" | "medita" | "camina";

export function Planta({ frases }: { frases: string[] }) {
  const carrilRef = useRef<HTMLDivElement>(null);
  const plantaRef = useRef<HTMLDivElement>(null);
  const follajeRef = useRef<SVGGElement>(null);
  const globoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const carril = carrilRef.current;
    const planta = plantaRef.current;
    const follaje = follajeRef.current;
    const globo = globoRef.current;
    if (!carril || !planta || !follaje || !globo) return;
    if (frases.length === 0) return;

    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const azar = (min: number, max: number) => min + Math.random() * (max - min);

    let x = 0.45;
    let destino = x;
    let dir: 1 | -1 = 1;
    let estado: Estado = "quieta";
    let hasta = 0;
    let anterior: number | null = null;
    let cuadro = 0;
    let ultima = "";

    const temporizadores: ReturnType<typeof setTimeout>[] = [];
    let cierreGlobo: ReturnType<typeof setTimeout> | undefined;

    function cambiar(nuevo: Estado, ahora: number, duracion: number) {
      estado = nuevo;
      planta!.classList.toggle("medita", nuevo === "medita");
      if (nuevo === "camina") {
        // Un paseíto: entre un quinto y medio carril, para cualquier lado.
        const salto = azar(0.2, 0.5) * (Math.random() < 0.5 ? -1 : 1);
        destino = Math.min(1, Math.max(0, x + salto));
        dir = destino > x ? 1 : -1;
      }
      hasta = ahora + duracion;
    }

    function siguiente(ahora: number) {
      const r = Math.random();
      if (r < 0.5) cambiar("medita", ahora, azar(18_000, 38_000));
      else if (r < 0.85) cambiar("quieta", ahora, azar(8_000, 16_000));
      else cambiar("camina", ahora, azar(3_000, 6_000));
    }

    function parpadear() {
      const t = setTimeout(() => {
        if (estado !== "medita") {
          planta!.classList.add("parpadea");
          temporizadores.push(
            setTimeout(() => planta!.classList.remove("parpadea"), 130),
          );
        }
        parpadear();
      }, azar(2_600, 6_400));
      temporizadores.push(t);
    }

    function colocarGlobo(izq: number) {
      // A la izquierda de la planta y no arriba: arriba está el sello de
      // sincronización y el toggle de tema, y el globo les caería encima.
      globo!.style.right = `${carril!.clientWidth - izq + 6}px`;
    }

    function hablar() {
      // Si estaba meditando, abre los ojos para hablar.
      if (estado === "medita") cambiar("quieta", performance.now(), 9_000);

      let frase = frases[Math.floor(Math.random() * frases.length)]!;
      if (frases.length > 1) {
        while (frase === ultima) {
          frase = frases[Math.floor(Math.random() * frases.length)]!;
        }
      }
      ultima = frase;

      globo!.textContent = frase;
      colocarGlobo(x * (carril!.clientWidth - planta!.offsetWidth));
      globo!.classList.add("visible");
      clearTimeout(cierreGlobo);
      cierreGlobo = setTimeout(() => globo!.classList.remove("visible"), GLOBO_MS);
    }

    function dibujar(ahora: number) {
      if (anterior === null) {
        anterior = ahora;
        hasta = ahora + 1_200;
      }
      const dt = Math.min(ahora - anterior, 48);
      anterior = ahora;

      if (!quieto && ahora >= hasta) siguiente(ahora);

      let caminando = estado === "camina" && !quieto;
      if (caminando) {
        x += dir * VELOCIDAD * dt;
        if ((dir === 1 && x >= destino) || (dir === -1 && x <= destino)) {
          x = destino;
          cambiar("quieta", ahora, azar(6_000, 14_000));
          caminando = false;
        }
        x = Math.min(1, Math.max(0, x));
      }

      const izq = x * (carril!.clientWidth - planta!.offsetWidth);

      let bote = 0;
      let inclina = 0;
      let hojas = 0;
      let respira = 1;

      if (caminando) {
        const paso = Math.sin(ahora / 240);
        bote = Math.abs(paso) * 2.2;
        inclina = paso * 2.4;
        hojas = Math.sin(ahora / 240 - 0.7) * 3.2;
      } else if (estado === "medita" && !quieto) {
        respira = 1 + Math.sin(ahora / 1_700) * 0.022;
        hojas = Math.sin(ahora / 2_400) * 1.1;
      } else if (!quieto) {
        hojas = Math.sin(ahora / 3_200) * 0.8;
      }

      planta!.style.transform =
        `translateX(${izq}px) translateY(${-bote}px) ` +
        `rotate(${inclina}deg) scaleX(${dir === 1 ? 1 : -1})`;

      // El scale vertical se toma desde arriba del viewBox, así que hay que
      // bajarlo de vuelta o el tallo se despega de la maceta al respirar.
      follaje!.setAttribute(
        "transform",
        `translate(0 ${(21 * (1 - respira)).toFixed(3)}) ` +
          `rotate(${hojas} 20 21) scale(1 ${respira.toFixed(4)})`,
      );

      if (globo!.classList.contains("visible")) colocarGlobo(izq);

      cuadro = requestAnimationFrame(dibujar);
    }

    const reloj = setInterval(hablar, CADA_MS);
    parpadear();
    cuadro = requestAnimationFrame(dibujar);
    temporizadores.push(setTimeout(hablar, 4_000));

    return () => {
      cancelAnimationFrame(cuadro);
      clearInterval(reloj);
      clearTimeout(cierreGlobo);
      for (const t of temporizadores) clearTimeout(t);
    };
  }, [frases]);

  return (
    /*
     * Absoluta y fuera del flujo, no un hijo más de la barra.
     *
     * Las cuatro mascotas eran un hijo flex de 64px de alto en un `nav` con
     * `items-end`, así que eran ELLAS las que fijaban la altura de la barra: las
     * pestañas quedaban empujadas contra el borde de abajo y entre el título y
     * las pestañas aparecía un hueco de treinta y pico de píxeles que no lo
     * ponía nadie. El comentario de aquel componente decía que nunca podía
     * mover la navegación de lugar, y la movía por lo alto.
     *
     * Sacada del flujo, la barra mide lo que miden las pestañas y la planta
     * sigue parada en la línea.
     */
    <div
      ref={carrilRef}
      aria-hidden="true"
      className="pointer-events-none absolute bottom-0 right-6 hidden h-11 w-[150px] min-[1100px]:block"
    >
      {/*
       * Baja y ancha, no alta y flaca.
       *
       * Desde la línea hasta el sello de sincronización hay 41px y nada más, y
       * la planta cuelga de la línea hacia arriba. Con la silueta alta las
       * hojas le crecían por encima del "salir". Achicar esa misma silueta no
       * servía: la carita vive en la maceta y se volvía un borrón.
       *
       * Así que la maceta se lleva más de la mitad del alto y las hojas son
       * cortas. Entra en el hueco y la cara se sigue leyendo, que es lo único
       * que esta cosa tiene que lograr.
       */}
      <div
        ref={plantaRef}
        className="planta absolute bottom-0 left-0 w-[40px] origin-bottom will-change-transform"
      >
        <svg viewBox="0 0 40 44" width="40" height="44" className="block overflow-visible">
          {/* Las burbujitas de meditar. */}
          <g className="planta-aura">
            <circle cx="31" cy="14" r="1.5" />
            <circle cx="34" cy="12" r="1.2" />
            <circle cx="30" cy="10" r="1" />
          </g>

          <path className="planta-tierra" d="M8 21 L32 21 L29 43 L11 43 Z" />
          <path className="planta-maceta" d="M8 21 L32 21 L29 43 L11 43 Z" />
          <path className="planta-maceta" d="M6 21 L34 21" />

          {/* La carita, sobre la maceta. Es lo más grande del dibujo. */}
          <circle className="planta-ojo" cx="15.5" cy="30" r="2" />
          <circle className="planta-ojo" cx="24.5" cy="30" r="2" />
          <path className="planta-ojo-cerrado" d="M13.2 30 Q15.5 32.4 17.8 30" />
          <path className="planta-ojo-cerrado" d="M22.2 30 Q24.5 32.4 26.8 30" />
          <path className="planta-boca" d="M16.6 35.4 Q20 38.2 23.4 35.4" />
          <path className="planta-boca-zen" d="M17 36.4 L23 36.4" />

          <g ref={follajeRef}>
            <path className="planta-tallo" d="M20 21 C20 16 20 12 20 9" />
            <path className="planta-hoja" d="M20 15 C15 14.4 11 11.6 10.4 7.2 C14.8 6.6 18.6 9.4 19.4 13.6" />
            <path className="planta-hoja" d="M20 12 C25 11.4 29 8.6 29.6 4.2 C25.2 3.6 21.4 6.4 20.6 10.6" />
            <path className="planta-hoja" d="M20 9.6 C18.8 5.6 19.6 1.8 22.4 0 C24.2 2.6 23.6 6.6 20.8 8.8" />
          </g>
        </svg>
      </div>

      <div ref={globoRef} className="planta-globo" />
    </div>
  );
}
