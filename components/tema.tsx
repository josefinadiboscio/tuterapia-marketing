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

  // The icon shows what a click switches TO, not what is on: a sun on the dark
  // theme reads as "go to light". A word said the opposite thing in the same
  // spot and was read backwards as often as not.
  return (
    <button
      type="button"
      onClick={() => cambiar(siguiente[tema])}
      className="flex h-7 w-7 items-center justify-center rounded-full border border-borde bg-surface text-sec transition-colors hover:border-sec hover:text-texto"
      title={tema === "oscuro" ? "Cambiar a claro" : "Cambiar a oscuro"}
      aria-label={tema === "oscuro" ? "Cambiar a claro" : "Cambiar a oscuro"}
    >
      {tema === "oscuro" ? <Sol /> : <Luna />}
    </button>
  );
}

function Sol() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line
          key={a}
          x1="12"
          y1="2.4"
          x2="12"
          y2="5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          transform={`rotate(${a} 12 12)`}
        />
      ))}
    </svg>
  );
}

function Luna() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
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
