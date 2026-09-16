/**
 * A tab that is not built yet. It says what it will hold and what is missing
 * to enable it, because "próximamente" tells the person nothing about whether
 * they should wait or go load something.
 */
export function Pendiente({
  titulo,
  contenido,
  falta,
}: {
  titulo: string;
  contenido: string[];
  falta: string[];
}) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-xs uppercase tracking-wide text-slate-400">
        {titulo} · sin construir
      </p>

      <h2 className="mt-6 text-xs uppercase tracking-wide text-slate-400">
        Qué va a contener
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
        {contenido.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>

      <h2 className="mt-7 text-xs uppercase tracking-wide text-slate-400">
        Qué falta para habilitarla
      </h2>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
        {falta.map((linea) => (
          <li key={linea}>{linea}</li>
        ))}
      </ul>
    </main>
  );
}
