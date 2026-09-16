/**
 * Trend in words, and the automatic reading of the screen.
 *
 * A month-over-month delta says what happened once; a slope over six months
 * says where the thing is going. The card shows the second, because that is
 * the question someone opens this screen with.
 *
 * The rules are written down in METRICAS.md: a sentence the dashboard says out
 * loud has to be as auditable as a number.
 */
export type Direccion = "creciendo" | "estable" | "bajando" | "sin_datos";

export type Tendencia = {
  direccion: Direccion;
  cambio: number | null;
  /** A rate moves in percentage points; a count moves in percent. */
  unidad: "pct" | "pp";
  meses: number;
};

export const MESES_TENDENCIA = 6;

/** Relative change under this is flat, for counts and for money. */
const UMBRAL_PCT = 0.05;
/** Percentage points under this is flat, for rates. */
const UMBRAL_PP = 0.01;

/**
 * Least-squares slope over the closed months, expressed as the change across
 * the whole window. A slope resists the single odd month that a
 * first-against-last comparison would read as a trend.
 */
export function tendencia(
  valores: (number | null)[],
  unidad: "pct" | "pp",
): Tendencia {
  const puntos = valores
    .map((v, i) => ({ x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p.y !== null);

  if (puntos.length < 3) {
    return { direccion: "sin_datos", cambio: null, unidad, meses: puntos.length };
  }

  const n = puntos.length;
  const mediaX = puntos.reduce((a, p) => a + p.x, 0) / n;
  const mediaY = puntos.reduce((a, p) => a + p.y, 0) / n;

  const covarianza = puntos.reduce(
    (a, p) => a + (p.x - mediaX) * (p.y - mediaY),
    0,
  );
  const varianza = puntos.reduce((a, p) => a + (p.x - mediaX) ** 2, 0);
  if (varianza === 0) {
    return { direccion: "estable", cambio: 0, unidad, meses: n };
  }

  const pendiente = covarianza / varianza;
  const cambioAbsoluto = pendiente * (n - 1);

  if (unidad === "pp") {
    const direccion =
      Math.abs(cambioAbsoluto) < UMBRAL_PP
        ? "estable"
        : cambioAbsoluto > 0
          ? "creciendo"
          : "bajando";
    return { direccion, cambio: cambioAbsoluto, unidad, meses: n };
  }

  // Relative to where the fitted line starts, not to the first observed point.
  const base = mediaY - pendiente * mediaX;
  if (base <= 0) {
    return { direccion: "sin_datos", cambio: null, unidad, meses: n };
  }

  const relativo = cambioAbsoluto / base;
  const direccion =
    Math.abs(relativo) < UMBRAL_PCT
      ? "estable"
      : relativo > 0
        ? "creciendo"
        : "bajando";

  return { direccion, cambio: relativo, unidad, meses: n };
}

/**
 * The automatic reading. Rules are checked in order and the first that fires
 * wins, so the most specific ones go first.
 *
 * Every rule is a statement about two slopes. None of them claims a cause the
 * data cannot support: "the CAC rises and the cost per registration does not"
 * is arithmetic, and the sentence says what that arithmetic means.
 */
export function lectura(t: {
  conversion: Tendencia;
  registros: Tendencia;
  nuevos: Tendencia;
  activos: Tendencia;
  cac: Tendencia;
  costoRegistro: Tendencia;
  ltv: Tendencia;
  ltvSobreCac: number | null;
}): string | null {
  const sube = (x: Tendencia) => x.direccion === "creciendo";
  const baja = (x: Tendencia) => x.direccion === "bajando";
  const quieto = (x: Tendencia) => x.direccion === "estable";
  const hay = (x: Tendencia) => x.direccion !== "sin_datos";

  if (t.ltvSobreCac !== null && t.ltvSobreCac < 1) {
    return "Cada paciente cuesta más de lo que deja. Mientras el LTV no cubra el CAC, más volumen es más pérdida.";
  }

  if (hay(t.cac) && hay(t.costoRegistro)) {
    if (sube(t.cac) && !sube(t.costoRegistro)) {
      return "El CAC sube sin que suba el costo por registro: el tráfico no se encareció, se está convirtiendo peor. El problema está en el funnel, no en la pauta.";
    }
    if (sube(t.cac) && sube(t.costoRegistro)) {
      return "El CAC sube junto con el costo por registro: se encareció el tráfico. Es precio de medios, no conversión.";
    }
    if (baja(t.cac) && !baja(t.costoRegistro)) {
      return "El CAC baja sin que baje el costo por registro: se está convirtiendo mejor con el mismo tráfico.";
    }
  }

  if (baja(t.conversion) && sube(t.registros)) {
    return "Entra más gente y convierte peor. El volumen está creciendo sobre tráfico de menor intención.";
  }

  if (sube(t.conversion) && baja(t.registros)) {
    return "Entra menos gente pero convierte mejor. El volumen cae sobre tráfico más calificado.";
  }

  if (baja(t.registros) && quieto(t.conversion)) {
    return "Cae el volumen de entrada y la conversión no se movió: el problema está antes del registro.";
  }

  if (baja(t.activos) && !baja(t.nuevos)) {
    return "Los pacientes nuevos se sostienen pero los activos caen: se está yendo gente por el otro lado.";
  }

  if (quieto(t.conversion) && quieto(t.registros) && quieto(t.nuevos)) {
    return "Sin movimientos relevantes en los últimos seis meses cerrados.";
  }

  return null;
}
