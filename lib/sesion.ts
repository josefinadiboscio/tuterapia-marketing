/**
 * Temporary gate for the dashboard.
 *
 * The URL is public and the numbers are not, so the pages sit behind a shared
 * password until Supabase Auth restricted to the company domain replaces this
 * (CLAUDE.md). The cookie holds a hash of the password, never the password.
 */
export const COOKIE = "sesion";

export async function tokenDeSesion(password: string): Promise<string> {
  const data = new TextEncoder().encode(`tuterapia-marketing:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
