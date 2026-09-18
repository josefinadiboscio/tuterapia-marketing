import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * El cliente de Supabase para Server Components y route handlers.
 *
 * Se usa SOLO para auth. Los datos siguen saliendo por `lib/db.ts` con una
 * conexión directa de Postgres: el schema `marketing` no está expuesto en la
 * API de Supabase y el job necesita transacciones de verdad. Mezclar las dos
 * cosas sería tener dos caminos a la misma tabla con dos juegos de permisos.
 *
 * Un Server Component no puede escribir cookies. El refresh del token lo hace
 * el middleware, que sí puede, así que acá `setAll` no hace nada y eso es
 * correcto, no una omisión.
 */
export async function clienteServidor() {
  const store = await cookies();

  return createServerClient(url(), clave(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (aGuardar) => {
        try {
          for (const { name, value, options } of aGuardar) {
            store.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component. El middleware ya refrescó.
        }
      },
    },
  });
}

/** El usuario de la sesión, o null. Nunca tira: sin sesión no hay pantalla. */
export async function usuarioActual(): Promise<{
  id: string;
  email: string;
} | null> {
  const supabase = await clienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return null;
  return { id: user.id, email: user.email };
}

export function url(): string {
  const valor = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!valor) throw new Error("falta NEXT_PUBLIC_SUPABASE_URL");
  return valor;
}

export function clave(): string {
  const valor = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!valor) throw new Error("falta NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  return valor;
}
