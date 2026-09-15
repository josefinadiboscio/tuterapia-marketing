/**
 * Resolves a raw utm_source to a platform using the patterns in
 * marketing.utm_mapping.
 *
 * utm_source is not a source, it is a code with platform and country inside
 * ('metaars', 'tkarg'), so the match is by SQL-style pattern. Several patterns
 * can match the same source — 'tk%' and 'tiktok' both do — and `orden` breaks
 * the tie, lowest first, so a specific pattern beats a wildcard.
 */
export type UtmMapping = {
  patron: string;
  plataforma: string;
  superficie: string | null;
  es_pago: boolean;
  orden: number;
};

export const SIN_UTM = "Sin utm";
export const SIN_MAPEAR = "Sin mapear";

export function resolverPlataforma(
  utmSource: string,
  mapping: UtmMapping[],
): string {
  const source = utmSource.trim().toLowerCase();
  if (source === "") return SIN_UTM;

  const match = [...mapping]
    .sort((a, b) => a.orden - b.orden || b.patron.length - a.patron.length)
    .find((row) => patronRegex(row.patron).test(source));

  return match?.plataforma ?? SIN_MAPEAR;
}

function patronRegex(patron: string): RegExp {
  const escaped = patron
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*");
  return new RegExp(`^${escaped}$`);
}
