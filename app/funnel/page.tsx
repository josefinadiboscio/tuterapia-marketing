import { Nav, Selectores, contexto } from "@/components/nav";
import { Pendiente } from "@/components/pendiente";

export const dynamic = "force-dynamic";

export default async function Funnel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await contexto(await searchParams);

  return (
    <>
      <Nav activa="/funnel" ctx={ctx} />
      <Selectores activa="/funnel" ctx={ctx} />
      <Pendiente
        titulo="Funnel"
        contenido={[
          "Embudo hasta la segunda sesión: registro, terapeuta asignado, primer pago, primera sesión realizada, segunda sesión.",
          "Tasa de no-show: la brecha entre pacientes nuevos, que cuenta la venta, y activados, que cuenta la primera sesión.",
          "Aparte del embudo, curva de permanencia por cohorte. Después de la segunda sesión ya no hay etapas, hay permanencia: son dos objetos distintos.",
          "Segmentable por canal.",
        ]}
        falta={[
          "La especificación de las etapas. BUILD.md fase 6 pide no empezar sin ella.",
          "Activados ya se calcula y se guarda en cada corrida, así que la tasa de no-show sale apenas se defina la pantalla.",
        ]}
      />
    </>
  );
}
