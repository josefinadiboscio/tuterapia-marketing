import { redirect } from "next/navigation";

/** General is the home screen; the URL stays honest about which tab it is. */
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  // No country is forced here: an empty query lets the default apply, which is
  // TOTAL or whatever was chosen last. Hardcoding AR here was overriding both.
  const { pais, mes } = await searchParams;
  const query = new URLSearchParams();
  if (pais) query.set("pais", pais);
  if (mes) query.set("mes", mes);
  const cola = query.toString();
  redirect(cola ? `/general?${cola}` : "/general");
}
