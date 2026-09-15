import { timingSafeEqual } from "node:crypto";

/**
 * The cron URLs are public, so the bearer token is the only gate.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` on its own.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(request.headers.get("authorization") ?? "");

  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
}
