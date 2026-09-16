import { redirect } from "next/navigation";

/** General is the home screen; the URL stays honest about which tab it is. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const { pais, mes } = await searchParams;
  const query = new URLSearchParams({ pais: pais ?? "AR" });
  if (mes) query.set("mes", mes);
  redirect(`/general?${query}`);
}
