import { LOCAL_UTC_OFFSET_HOURS } from "@/lib/queries/shared";

/**
 * The four of them, standing on the line under the tabs.
 *
 * Decoration and nothing else: no alt text, no animation, hidden on narrow
 * screens. It can never push the navigation around, so every image carries its
 * own width and height and the row is bottom-aligned — feet on the divider.
 *
 * Four people, one per stretch of the day, always in the same order and all
 * four at full strength. They were faded at first and one of them lit up with
 * the hour, which made the drawing read as a state — something you were meant
 * to look at — instead of a drawing standing on a line.
 *
 * Which pose shows is the day of the month modulo three: stable across
 * reloads, different tomorrow, and the same day for all four so they change
 * together. Local day (UTC−3), like every other date on this dashboard.
 */

/** Fixed order, left to right. They are four people and they never swap. */
const FRANJAS = ["noche", "manana", "tarde", "creando"] as const;

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
  // Only the day matters now: it picks the pose. The hour picked which one lit
  // up, and nothing lights up any more.
  const local = new Date(ahora.getTime() - LOCAL_UTC_OFFSET_HOURS * 3_600_000);
  const variante = (local.getUTCDate() % 3) + 1;

  return (
    <div
      aria-hidden="true"
      className="ml-auto hidden items-end gap-[72px] min-[1100px]:flex"
    >
      {FRANJAS.map((nombre) => {
        const archivo = `${nombre}-${variante}`;
        const t = TAMANO[archivo]!;
        return (
          <img
            key={nombre}
            src={`/mascots/${archivo}.png`}
            width={t.ancho}
            height={t.alto}
            alt=""
            draggable={false}
            className="mascota block select-none"
          />
        );
      })}
    </div>
  );
}
