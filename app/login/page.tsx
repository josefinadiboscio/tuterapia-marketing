import { DOMINIO } from "@/lib/supabase/dominio";

export const dynamic = "force-dynamic";

/**
 * La pantalla de entrada.
 *
 * Mail y contraseña. El mail importa: desde acá cada descarga de datos
 * personales queda con nombre y apellido en `marketing.export_log`, que es
 * todo el motivo de haber dejado la contraseña compartida.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; falta?: string; dominio?: string }>;
}) {
  const { error, falta, dominio } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6">
      <div>
        <h1 className="titulo-app">
          <span className="text-texto">Tu Terapia</span>
          <span className="mx-1.5 text-ter">·</span>
          <span className="text-orange">Marketing Dash</span>
        </h1>
        <p className="mt-2 text-sm text-sec">
          Con tu cuenta de <span className="text-texto">@{DOMINIO}</span>.
        </p>
      </div>

      {falta ? (
        <p className="rounded-md bg-warn-bg px-3 py-2 text-sm text-warn">
          Faltan NEXT_PUBLIC_SUPABASE_URL o
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en Vercel.
        </p>
      ) : null}

      <form action="/api/login" method="post" className="flex flex-col gap-3">
        <input
          type="email"
          name="email"
          autoFocus
          autoComplete="username"
          placeholder="mail"
          className="rounded-md border border-borde bg-surface px-3 py-2 text-sm text-texto outline-none focus:border-acento"
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="Contraseña"
          className="rounded-md border border-borde bg-surface px-3 py-2 text-sm text-texto outline-none focus:border-acento"
        />
        <button
          type="submit"
          className="rounded-md bg-acento px-3 py-2 text-sm text-bg"
        >
          Entrar
        </button>
        {/* Un solo mensaje para mail inexistente y contraseña equivocada:
            distinguirlos convierte el formulario en una forma de averiguar
            qué mails tienen cuenta. */}
        {error ? (
          <p className="text-sm text-danger">Mail o contraseña incorrectos.</p>
        ) : null}
        {dominio ? (
          <p className="text-sm text-danger">
            Solo cuentas @{DOMINIO}.
          </p>
        ) : null}
      </form>
    </main>
  );
}
