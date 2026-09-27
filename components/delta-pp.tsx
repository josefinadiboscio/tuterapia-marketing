/**
 * El cambio de un porcentaje contra el período anterior, en puntos.
 *
 * Vive acá y no en la tabla porque las cards de arriba muestran exactamente
 * las mismas filas: si cada una tuviera su propia copia, alcanzaría con tocar
 * una para que el mismo número apareciera de dos formas en la misma pantalla.
 *
 * Menos caída es mejor, así que el negativo es el verde. Por debajo de media
 * décima dice "=" en vez de callarse: un hueco donde siempre hay un número se
 * lee como un dato que falta, no como uno que no se movió.
 */
export function DeltaPp({
  valor,
  conUnidad = false,
}: {
  valor: number | null;
  /** " pp" al lado. La tabla no lo necesita: lo dice el encabezado. */
  conUnidad?: boolean;
}) {
  if (valor === null) return null;
  const puntos = valor * 100;
  if (Math.abs(puntos) < 0.05) return <span className="text-ter">=</span>;
  return (
    <span className={puntos < 0 ? "text-green" : "text-ambar"}>
      {puntos > 0 ? "+" : "−"}
      {Math.abs(puntos).toFixed(1).replace(".", ",")}
      {conUnidad ? " pp" : ""}
    </span>
  );
}
