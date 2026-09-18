import { NextResponse } from "next/server";
import { clienteServidor } from "@/lib/supabase/servidor";

export const runtime = "nodejs";

/**
 * Salir.
 *
 * POST y no GET: un logout en un link se dispara solo con cualquier cosa que
 * prefetchee la página.
 *
 * `signOut` borra las cookies a través de `cookies()`, que en un route handler
 * sí escribe sobre la respuesta. Por eso acá alcanza con el cliente de
 * servidor de siempre y no hay que armar uno a mano.
 */
export async function POST(request: Request) {
  const supabase = await clienteServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
