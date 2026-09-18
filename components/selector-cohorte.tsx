"use client";

import { useRouter } from "next/navigation";

/**
 * El mes que dibuja el embudo.
 *
 * Doce meses en un desplegable y no doce chips: son demasiados para una fila
 * de links y el mes es un dato ordinal, no una opción entre pocas.
 *
 * Cliente porque navega al elegir, sin botón de confirmar. Las URLs vienen
 * armadas del servidor —una función no cruza el límite servidor/cliente, y
 * además armarlas acá obligaría a importar el módulo que conoce el contexto,
 * que arrastra `pg` al bundle del browser.
 */
export function SelectorCohorte({
  opciones,
  elegida,
}: {
  opciones: { mes: string; href: string }[];
  elegida: string | null;
}) {
  const router = useRouter();

  return (
    <select
      value={elegida ?? ""}
      onChange={(e) => {
        const destino = opciones.find((o) => o.mes === e.target.value);
        if (destino) router.push(destino.href);
      }}
      aria-label="Cohorte"
      className="rounded-md border border-borde bg-surface px-2 py-1 text-xs text-texto"
    >
      {opciones.map((o) => (
        <option key={o.mes} value={o.mes}>
          {o.mes}
        </option>
      ))}
    </select>
  );
}
