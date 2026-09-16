import { Nav, contextoDesde } from "@/components/nav";
import { Pendiente } from "@/components/pendiente";

export const dynamic = "force-dynamic";

export default async function Movimientos({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const ctx = contextoDesde(await searchParams);

  return (
    <>
      <Nav activa="/movimientos" ctx={ctx} />
      <Pendiente
        titulo="Movimientos"
        contenido={[
          "Resumen de los últimos 7 días contra los 7 anteriores, con el valor comparativo al lado del delta.",
          "Serie diaria de registros de 30 días: barras crudas con media móvil de 7 días encima, porque el patrón de fin de semana tapa la tendencia.",
          "Lista por plataforma de los últimos 7 días con volumen, participación y delta.",
          "La conversión va proyectada con la curva de madurez y marcada como tal. Es la única métrica de la pantalla que no es un conteo directo.",
        ]}
        falta={[
          "La tabla marketing.metricas_diarias, con fecha, país y plataforma.",
          "Que el job la escriba junto con la mensual, sincronizando los últimos 45 días en cada corrida.",
        ]}
      />
    </>
  );
}
