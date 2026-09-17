import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";

/**
 * The four of them, standing on the line under the tabs.
 *
 * Decoration and nothing else: no alt text, no animation, hidden on narrow
 * screens. It can never push the navigation around, so every image carries its
 * own width and height and the row is bottom-aligned — feet on the divider.
 *
 * Four people, one per stretch of the day, always in the same order. The one
 * whose stretch it is stands at full opacity and the other three sit back.
 *
 * Which pose shows is the day of the month modulo three: stable across
 * reloads, different tomorrow, and the same day for all four so they change
 * together. Local day (UTC−3), like every other date on this dashboard.
 */

const FRANJAS = [
  { nombre: "noche", desde: 0, hasta: 6 },
  { nombre: "manana", desde: 6, hasta: 12 },
  { nombre: "tarde", desde: 12, hasta: 19 },
  { nombre: "creando", desde: 19, hasta: 24 },
] as const;

/**
 * The size each file is drawn at.
 *
 * They are not all the same height on purpose: the twelve were trimmed to
 * their ink and scaled by one common factor, so the tallest standing pose is
 * 46px and the one lying down is the 28px she actually measures. Giving them
 * all the same height would blow her up to twice everyone else's size.
 *
 * Baked in rather than measured at runtime: the browser needs the box before
 * the image arrives, or the row reflows when it lands.
 */
const TAMANO: Record<string, { ancho: number; alto: number }> = {
  "creando-1": { ancho: 31, alto: 39 },
  "creando-2": { ancho: 33, alto: 37 },
  "creando-3": { ancho: 35, alto: 37 },
  "manana-1": { ancho: 28, alto: 46 },
  "manana-2": { ancho: 29, alto: 41 },
  "manana-3": { ancho: 29, alto: 45 },
  "noche-1": { ancho: 37, alto: 28 },
  "noche-2": { ancho: 31, alto: 36 },
  "noche-3": { ancho: 29, alto: 39 },
  "tarde-1": { ancho: 30, alto: 36 },
  "tarde-2": { ancho: 32, alto: 29 },
  "tarde-3": { ancho: 26, alto: 33 },
};

export function Mascotas({ ahora = new Date() }: { ahora?: Date }) {
  const local = new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000);
  const hora = local.getUTCHours();
  const dia = local.getUTCDate();

  const activa =
    FRANJAS.find((f) => hora >= f.desde && hora < f.hasta)?.nombre ?? "noche";
  const variante = (dia % 3) + 1;

  return (
    <div
      aria-hidden="true"
      className="ml-auto hidden items-end gap-[72px] min-[1100px]:flex"
    >
      {FRANJAS.map((f) => {
        const archivo = `${f.nombre}-${variante}`;
        const t = TAMANO[archivo]!;
        return (
          <img
            key={f.nombre}
            src={`/mascots/${archivo}.png`}
            width={t.ancho}
            height={t.alto}
            alt=""
            draggable={false}
            className={`mascota block select-none ${
              f.nombre === activa ? "opacity-100" : "opacity-35"
            }`}
          />
        );
      })}
    </div>
  );
}
