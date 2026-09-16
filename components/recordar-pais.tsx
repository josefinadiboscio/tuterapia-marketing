"use client";

import { useEffect } from "react";

/**
 * Remembers the country across visits.
 *
 * A cookie rather than localStorage because the server needs it to pick the
 * default before the first paint — otherwise every visit would flash TOTAL on
 * its way to whatever was last chosen.
 */
export function RecordarPais({ pais }: { pais: string }) {
  useEffect(() => {
    document.cookie = `pais=${pais}; path=/; max-age=31536000; samesite=lax`;
  }, [pais]);

  return null;
}
