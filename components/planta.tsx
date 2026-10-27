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
/**
 * Fracción del carril por milisegundo, cuando camina.
 *
 * El carril deja 106px de recorrido. Con el valor anterior —0,00055— un paseo
 * de medio carril se resolvía en 900 milisegundos: la planta llegaba al otro
 * extremo antes de que nadie levantara la vista. Caminaba de verdad y no se
 * veía nunca.
 *
 * Acá un paseo corto son unos tres segundos y uno largo casi ocho. Sigue
 * siendo el mismo rincón y la misma distancia corta; lo que cambió es que
 * ahora se puede mirar mientras pasa.
 */
const VELOCIDAD = 0.00009;

/**
 * Por dónde va la ronda de las frases que dice al tocarla.
 *
 * Vive afuera del componente porque cada pestaña monta su propio header: con
 * el contador adentro, la ronda empezaría de nuevo en cada cambio de pestaña y
 * podría repetir la que acababa de decir. La primera vez arranca en un lugar
 * al azar, para que no abra siempre con la misma.
 */
let turno: number | null = null;

function siguienteAlTocar(lista: string[]): string {
  turno =
    turno === null
      ? Math.floor(Math.random() * lista.length)
      : (turno + 1) % lista.length;
  return lista[turno]!;
}

type Estado = "quieta" | "medita" | "camina";

export function Planta({
  frases,
  alTocar,
}: {
  /** Lo que dice sola cada tanto, al azar. */
  frases: string[];
  /** Lo que dice cuando la tocan, de a una y en ronda. */
  alTocar: string[];
}) {
  const carrilRef = useRef<HTMLDivElement>(null);
  const plantaRef = useRef<HTMLDivElement>(null);
  const follajeRef = useRef<SVGGElement>(null);
  const globoRef = useRef<HTMLDivElement>(null);
  /**
   * Para poder apretarla y que diga algo.
   *
   * `hablar` vive adentro del efecto, que es donde están el estado y los
   * temporizadores. El ref es el único puente hacia el onClick sin sacar todo
   * eso afuera y convertirlo en estado de React, que es justo lo que este
   * componente evita.
   */
  const hablarRef = useRef<(() => void) | null>(null);

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
        // Un paseo: entre un cuarto y dos tercios del carril, para cualquier
        // lado. Con menos que eso el desplazamiento no se lee como tal.
        const salto = azar(0.25, 0.7) * (Math.random() < 0.5 ? -1 : 1);
        destino = Math.min(1, Math.max(0, x + salto));
        dir = destino > x ? 1 : -1;
      }
      hasta = ahora + duracion;
    }

    function siguiente(ahora: number) {
      const r = Math.random();
      // Meditar sigue siendo lo que más hace, pero caminar pasó de uno de cada
      // siete cambios a uno de cada tres: antes salía un paseo cada dos
      // minutos y duraba menos de un segundo.
      if (r < 0.4) cambiar("medita", ahora, azar(14_000, 26_000));
      else if (r < 0.65) cambiar("quieta", ahora, azar(6_000, 12_000));
      // El paseo termina cuando llega, no cuando se cumple el plazo. El plazo
      // es solo un tope por si el carril cambia de ancho a mitad de camino.
      else cambiar("camina", ahora, 12_000);
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

    /** Lo que dice sola: una de las suyas, al azar y sin repetir la última. */
    function hablar() {
      let frase = frases[Math.floor(Math.random() * frases.length)]!;
      if (frases.length > 1) {
        while (frase === ultima) {
          frase = frases[Math.floor(Math.random() * frases.length)]!;
        }
      }
      ultima = frase;
      decir(frase);
    }

    function decir(frase: string) {
      // Si estaba meditando, abre los ojos para hablar.
      if (estado === "medita") cambiar("quieta", performance.now(), 9_000);

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
        respira = 1 + Math.sin(ahora / 1_700) * 0.04;
        hojas = Math.sin(ahora / 2_400) * 2;
      } else if (!quieto) {
        // Parada tampoco es inmóvil: las hojas se mecen. Con 0,8 grados no se
        // notaba y la planta parecía una imagen pegada.
        hojas = Math.sin(ahora / 2_600) * 2.2;
      }

      planta!.style.transform =
        `translateX(${izq}px) translateY(${-bote}px) ` +
        `rotate(${inclina}deg) scaleX(${dir === 1 ? 1 : -1})`;

      // El scale vertical se toma desde arriba del viewBox, así que hay que
      // bajarlo de vuelta o el tallo se despega de la maceta al respirar.
      follaje!.setAttribute(
        "transform",
        `translate(0 ${(26 * (1 - respira)).toFixed(3)}) ` +
          `rotate(${hojas} 22 26) scale(1 ${respira.toFixed(4)})`,
      );

      if (globo!.classList.contains("visible")) colocarGlobo(izq);

      cuadro = requestAnimationFrame(dibujar);
    }

    let reloj = setInterval(hablar, CADA_MS);

    // Apretarla cuenta como que habló: si no, decía lo suyo y a los dos
    // segundos volvía a hablar sola porque el reloj seguía donde estaba.
    //
    // Al tocarla dice la siguiente de la ronda. Si no le pasaron ninguna para
    // eso, contesta con una de las suyas, como hacía antes.
    hablarRef.current = () => {
      if (alTocar.length > 0) decir(siguienteAlTocar(alTocar));
      else hablar();
      clearInterval(reloj);
      reloj = setInterval(hablar, CADA_MS);
    };
    parpadear();
    cuadro = requestAnimationFrame(dibujar);
    temporizadores.push(setTimeout(hablar, 4_000));

    return () => {
      hablarRef.current = null;
      cancelAnimationFrame(cuadro);
      clearInterval(reloj);
      clearTimeout(cierreGlobo);
      for (const t of temporizadores) clearTimeout(t);
    };
  }, [frases, alTocar]);

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
      className="pointer-events-none absolute bottom-0 right-6 hidden h-[46px] w-[150px] min-[1100px]:block"
    >
      {/*
       * La maceta se lleva menos de la mitad del alto.
       *
       * La primera versión tenía la maceta grande para que entrara la carita
       * en los 41px que había, y se veía lo que era: mucha maceta y poca
       * planta. Ahora la barra da 24px más de aire, y ese aire se lo lleva
       * entero el follaje: tres hojas más largas y más abiertas sobre una
       * maceta más angosta.
       *
       * La cara no se achicó. Es lo único que esta cosa tiene que lograr y
       * sigue midiendo lo mismo sobre una maceta más chica.
       */}
      <div
        ref={plantaRef}
        onClick={() => hablarRef.current?.()}
        className="planta pointer-events-auto absolute bottom-0 left-0 w-[44px] cursor-pointer origin-bottom will-change-transform"
      >
        <svg viewBox="0 0 44 46" width="44" height="46" className="block overflow-visible">
          {/* Las burbujitas de meditar. */}
          <g className="planta-aura">
            <circle cx="33" cy="8" r="1.5" />
            <circle cx="36" cy="6" r="1.2" />
            <circle cx="32" cy="4" r="1" />
          </g>

          <path className="planta-tierra" d="M11 26 L33 26 L30 45 L14 45 Z" />
          <path className="planta-maceta" d="M11 26 L33 26 L30 45 L14 45 Z" />
          <path className="planta-maceta" d="M9 26 L35 26" />

          {/* La carita, sobre la maceta. */}
          <circle className="planta-ojo" cx="17.5" cy="33" r="2" />
          <circle className="planta-ojo" cx="26.5" cy="33" r="2" />
          <path className="planta-ojo-cerrado" d="M15.2 33 Q17.5 35.4 19.8 33" />
          <path className="planta-ojo-cerrado" d="M24.2 33 Q26.5 35.4 28.8 33" />
          <path className="planta-boca" d="M18.6 38.2 Q22 41 25.4 38.2" />
          <path className="planta-boca-zen" d="M19 39.2 L25 39.2" />

          <g ref={follajeRef}>
            <path className="planta-tallo" d="M22 26 C22 21 22 16 22 12" />
            <path className="planta-hoja" d="M22 22 C15 21 9 16.5 8 9.5 C15 8.5 21 13 22 20" />
            <path className="planta-hoja" d="M22 17.5 C29 16.5 35 12 36 5 C29 4 23 8.5 22 15.5" />
            <path className="planta-hoja" d="M22 13 C20 7 21 2 24.5 0 C27.5 3 26.5 8 23 12" />
          </g>
        </svg>
      </div>

      <div ref={globoRef} className="planta-globo" />
    </div>
  );
}
