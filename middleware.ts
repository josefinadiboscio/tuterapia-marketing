import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { esDelDominio } from "@/lib/supabase/dominio";

/**
 * La puerta. Todo pasa por acá salvo el login y los crons, que llevan su
 * propio bearer.
 *
 * Hace dos cosas en el mismo paso: refresca el token de Supabase —un Server
 * Component no puede escribir cookies, así que si el refresh no ocurre acá no
 * ocurre en ningún lado— y decide si la sesión entra.
 *
 * Falla cerrada. Sin variables de entorno, sin sesión o con una cuenta que no
 * es del dominio de la empresa, la respuesta es el login. Un dashboard abierto
 * es peor que uno trabado.
 */
export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !clave) {
    return NextResponse.redirect(new URL("/login?falta=1", request.url));
  }

  // `response` se reasigna dentro de setAll: cuando Supabase rota el token
  // hay que devolver una respuesta nueva que lleve las cookies nuevas, o el
  // browser se queda con el token viejo y la sesión se cae sola en una hora.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (aGuardar) => {
        for (const { name, value } of aGuardar) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of aGuardar) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser y no getSession: getSession lee la cookie y le cree. Esto valida
  // el token contra Supabase, que es lo único que sirve para decidir acceso.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!esDelDominio(user.email)) {
    // La cuenta existe pero no es de la empresa. Se cierra la sesión en vez de
    // dejarla dando vueltas: si no puede entrar, no debería seguir viva.
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?dominio=1", request.url));
  }

  return response;
}

export const config = {
  /*
   * Los iconos quedan afuera.
   *
   * `app/icon.png` y `app/apple-icon.png` los sirve Next como rutas, y el
   * browser los pide SIN cookie de sesión. Si el middleware los agarra, los
   * redirige al login y la pestaña se queda sin ícono para siempre — sin
   * ningún error, porque un 302 a /login es una respuesta perfectamente
   * válida que simplemente no es una imagen.
   *
   * La lista decía `favicon`, que era el nombre viejo de la convención y no
   * cubre ninguno de los dos archivos que existen.
   */
  matcher: [
    "/((?!login|api/login|api/logout|api/cron|_next/static|_next/image|favicon|icon\\.png|apple-icon\\.png).*)",
  ],
};
