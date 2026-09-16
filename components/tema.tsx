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
type Tema = "claro" | "oscuro" | "sistema";

export function ToggleTema() {
  const [tema, setTema] = useState<Tema>("sistema");

  useEffect(() => {
    const guardado = leerGuardado();
    setTema(guardado);
  }, []);

  function cambiar(nuevo: Tema) {
    setTema(nuevo);
    aplicar(nuevo);
    try {
      if (nuevo === "sistema") localStorage.removeItem("tema");
      else localStorage.setItem("tema", nuevo);
    } catch {
      // Private browsing: the theme still applies for this page load.
    }
  }

  const siguiente: Record<Tema, Tema> = {
    sistema: "claro",
    claro: "oscuro",
    oscuro: "sistema",
  };

  const etiqueta: Record<Tema, string> = {
    sistema: "Sistema",
    claro: "Claro",
    oscuro: "Oscuro",
  };

  return (
    <button
      type="button"
      onClick={() => cambiar(siguiente[tema])}
      className="text-ter hover:text-texto"
      title="Cambiar entre claro, oscuro y la preferencia del sistema"
    >
      {etiqueta[tema]}
    </button>
  );
}

function leerGuardado(): Tema {
  try {
    const valor = localStorage.getItem("tema");
    if (valor === "claro" || valor === "oscuro") return valor;
  } catch {
    // Ignored: falls back to the system preference.
  }
  return "sistema";
}

function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === "sistema") raiz.removeAttribute("data-theme");
  else raiz.setAttribute("data-theme", tema === "claro" ? "light" : "dark");
}

/** Runs before first paint so the stored choice never flashes. */
export const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem('tema');
  if (t === 'claro') document.documentElement.setAttribute('data-theme', 'light');
  if (t === 'oscuro') document.documentElement.setAttribute('data-theme', 'dark');
} catch (e) {}
`;
