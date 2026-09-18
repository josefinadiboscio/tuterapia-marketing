import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { esDelDominio } from "@/lib/supabase/dominio";

export const runtime = "nodejs";

/**
 * Entrar con mail y contraseña.
 *
 * El dominio se chequea ANTES de pedirle la sesión a Supabase, así una cuenta
 * de afuera no llega a tener un token emitido aunque la contraseña sea
 * correcta. El middleware lo vuelve a chequear en cada request; esto evita que
 * la sesión exista.
 *
 * El error que se devuelve es siempre el mismo, sin decir si falló el mail o
 * la contraseña: distinguirlos convierte el formulario en una forma de
 * averiguar qué mails tienen cuenta.
 */
export async function POST(request: Request) {
  const form = await request.formData();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");

  if (!esDelDominio(email)) {
    return NextResponse.redirect(new URL("/login?dominio=1", request.url), 303);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) {
    return NextResponse.redirect(new URL("/login?falta=1", request.url), 303);
  }

  const response = NextResponse.redirect(new URL("/", request.url), 303);

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => [],
      setAll: (aGuardar) => {
        for (const { name, value, options } of aGuardar) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.redirect(new URL("/login?error=1", request.url), 303);
  }

  return response;
}
