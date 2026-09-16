import { Nav, contextoDesde } from "@/components/nav";
import { Pendiente } from "@/components/pendiente";

export const dynamic = "force-dynamic";

export default async function Ads({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const ctx = contextoDesde(await searchParams);

  return (
    <>
      <Nav activa="/ads" ctx={ctx} />
      <Pendiente
        titulo="Ads"
        contenido={[
          "Tabla de campañas con el utm_source completo, no agrupado por plataforma.",
          "Semáforo de tres estados por campaña: sin veredicto, ok, red flag.",
          "Umbrales sobre la ventana de 14 días de METRICAS.md §5, que captura el 80% de las conversiones.",
        ]}
        falta={[
          "Gasto por campaña. Hoy Admin carga gasto por canal, y un semáforo por campaña necesita el gasto a ese nivel.",
          "Definir los umbrales de cada estado: cuánto CAC es red flag y cuántas conversiones hacen falta antes de dar un veredicto.",
        ]}
      />
    </>
  );
}
