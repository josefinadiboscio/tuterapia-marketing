/**
 * Quién puede entrar.
 *
 * No alcanza con tener una cuenta: la cuenta tiene que ser del dominio de la
 * empresa. Está acá, sin dependencias, porque lo verifican tres lugares —el
 * middleware, el login y las rutas que exportan datos personales— y una regla
 * de acceso escrita tres veces es una regla que va a divergir.
 *
 * Se chequea también en el login, aunque el middleware ya lo haga: una sesión
 * que nunca debió existir es peor que una sesión rechazada en cada request.
 */
export const DOMINIO = "tuterapia.com.uy";

export function esDelDominio(email: string | null | undefined): boolean {
  return typeof email === "string" && email.toLowerCase().endsWith(`@${DOMINIO}`);
}
