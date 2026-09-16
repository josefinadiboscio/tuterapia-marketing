"use client";

import { useEffect, useState } from "react";

/**
 * Theme toggle. The system preference is the default; an explicit choice wins
 * over it and is remembered.
 *
 * The choice is applied by the inline script in the layout before first paint,
 * so this component only has to reflect and change it — no flash of the wrong
 * theme on load.
 */
/** Oscuro es el modo por defecto; claro es una elección explícita. */
type Tema = "claro" | "oscuro";

export function ToggleTema() {
  const [tema, setTema] = useState<Tema>("oscuro");

  useEffect(() => {
    const guardado = leerGuardado();
    setTema(guardado);
  }, []);

  function cambiar(nuevo: Tema) {
    setTema(nuevo);
    aplicar(nuevo);
    try {
      localStorage.setItem("tema", nuevo);
    } catch {
      // Private browsing: the theme still applies for this page load.
    }
  }

  const siguiente: Record<Tema, Tema> = { oscuro: "claro", claro: "oscuro" };
  const etiqueta: Record<Tema, string> = { oscuro: "Oscuro", claro: "Claro" };

  return (
    <button
      type="button"
      onClick={() => cambiar(siguiente[tema])}
      className="text-ter hover:text-texto"
      title="Cambiar entre oscuro y claro"
    >
      {etiqueta[tema]}
    </button>
  );
}

function leerGuardado(): Tema {
  try {
    if (localStorage.getItem("tema") === "claro") return "claro";
  } catch {
    // Ignored: dark is the default.
  }
  return "oscuro";
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "claro") raiz.setAttribute("data-theme", "light");
  else raiz.removeAttribute("data-theme");
}

/** Runs before first paint so the stored choice never flashes. */
export const SCRIPT_TEMA = `
try {
  if (localStorage.getItem('tema') === 'claro') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
} catch (e) {}
`;
