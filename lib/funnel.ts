import { withDb } from "@/lib/db";

/**
 * The funnel is one cohort followed forward, not a set of monthly totals
 * stacked on top of each other.
 *
 * That distinction was wrong until now and it mattered: Registros counted the
 * people who signed up in the month, while Compraron counted the sales closed
 * in the month — whoever they were and whenever they had signed up. The drop
 * between the two was a comparison of two different populations.
 *
 * Every stage here is the same group of people: those who registered in the
 * month. How many of them bought, how many did a first session, a second, and
 * so on to the twelfth.
 */

/** The last stage the screen draws. Two more are stored, so the tenth has somewhere to fall to. */
export const ULTIMA_ETAPA = 10;

/**
 * How long an nth session needs, measured against the YOUNGEST member of the
 * cohort rather than the oldest.
 *
 * Both numbers are measured, not assumed. Getting to a first session takes a
 * median of 3 to 4 days with a p80 of 8 to 12, so the p80 is the wait here.
 * The gap from a first session to a second averages 9 days.
 *
 * Counting from the first of the month was the bug: the September cohort was
 * fifteen days old by that count and drew a 89% drop from first to second
 * session, when its newest members had had a single day to come back. A
 * cohort is only ready when everyone in it has had the time, so the clock
 * starts the day the month closes.
 */
const DIAS_PRIMERA_SESION = 10;
const DIAS_ENTRE_SESIONES = 9;

export type Etapa = {
  nombre: string;
  /** null means the cohort has not had time to get here yet, never zero. */
  valor: number | null;
};

export type PasoCohorte = {
  /** 1 means the step from session 1 to session 2. */
  desde: number;
  /** Share of those who reached `desde` that never reached the next one. */
  caida: number | null;
};

export type FilaCohorte = {
  cohorte: string;
  n: number;
  pasos: PasoCohorte[];
};

export type VistaFunnel = {
  mes: string | null;
  etapas: Etapa[];
  medianaSesion: number | null;
  p80Sesion: number | null;
  compranEn24h: number | null;
  noShow: number | null;
  caida1a2: number | null;
  grilla: FilaCohorte[];
  meses: string[];
};

export async function leerFunnel(
  pais: string,
  mes?: string,
): Promise<VistaFunnel> {
  return withDb(async (db) => {
    const { rows: meses } = await db.query<{ mes: string }>(
      `select distinct to_char(mes, 'YYYY-MM') as mes
         from marketing.metricas_mensuales
        where es_provisorio = false order by mes desc limit 12`,
    );
    const disponibles = meses.map((m) => m.mes);
    const elegido = mes && disponibles.includes(mes) ? mes : (disponibles[0] ?? null);

    if (!elegido) {
      return {
        mes: null,
        etapas: [],
        medianaSesion: null,
        p80Sesion: null,
        compranEn24h: null,
        noShow: null,
        caida1a2: null,
        grilla: [],
        meses: [],
      };
    }

    const [mensual, sesiones, grillaRaw] = await Promise.all([
      db.query<{
        registros: number;
        mediana_dias_sesion: string | null;
        p80_dias_sesion: string | null;
        compran_24h: string | null;
      }>(
        `select registros, mediana_dias_sesion::text, p80_dias_sesion::text,
                compran_24h::text
           from marketing.metricas_mensuales
          where pais = $1 and plataforma = 'TODAS'
            and to_char(mes, 'YYYY-MM') = $2`,
        [pais, elegido],
      ),
      db.query<{
        nro_sesion: number;
        pacientes: number;
        cohorte_n: number;
        cohorte_compraron: number | null;
      }>(
        `select nro_sesion, pacientes, cohorte_n, cohorte_compraron
           from marketing.cohorte_sesiones
          where pais = $1 and to_char(cohorte, 'YYYY-MM') = $2
          order by nro_sesion`,
        [pais, elegido],
      ),
      db.query<{
        cohorte: string;
        edad_dias: number;
        n: number;
        nro_sesion: number;
        pacientes: number;
      }>(
        `select to_char(cohorte, 'YYYY-MM') as cohorte,
                -- Days since the month CLOSED, so the number holds for
                -- whoever signed up on its last day too.
                (current_date - (cohorte + interval '1 month')::date)::int
                  as edad_dias,
                cohorte_n as n, nro_sesion, pacientes
           from marketing.cohorte_sesiones
          where pais = $1
            and cohorte >= (date_trunc('month', current_date) - interval '6 months')
          order by cohorte desc, nro_sesion`,
        [pais],
      ),
    ]);

    const fila = mensual.rows[0];
    const registros = fila?.registros ?? null;

    // Of the people who registered this month, how many ever bought — no
    // window. conversion_cohorte stops at thirty days, and the session stages
    // below have no clock at all, so using it here drew a first session larger
    // than the purchase above it.
    const compraron = sesiones.rows[0]?.cohorte_compraron ?? null;

    const edad = edadDeCohorte(elegido);
    const porSesion = new Map(sesiones.rows.map((r) => [r.nro_sesion, r.pacientes]));

    const etapas: Etapa[] = [
      { nombre: "Registros", valor: registros },
      { nombre: "Compraron", valor: compraron },
      ...Array.from({ length: ULTIMA_ETAPA }, (_, i) => {
        const nro = i + 1;
        return {
          nombre: `${nro}ª sesión`,
          valor: alcanzable(edad, nro) ? (porSesion.get(nro) ?? 0) : null,
        };
      }),
    ];

    const s1 = porSesion.get(1) ?? null;
    const s2 = porSesion.get(2) ?? null;

    return {
      mes: elegido,
      etapas,
      // The distance to sitting down, not to paying. Paying is a click and
      // happens the same day for most people, which is why that median reads
      // zero; finding a slot in a diary takes three to five days.
      medianaSesion:
        fila?.mediana_dias_sesion == null ? null : Number(fila.mediana_dias_sesion),
      p80Sesion:
        fila?.p80_dias_sesion == null ? null : Number(fila.p80_dias_sesion),
      compranEn24h:
        fila?.compran_24h == null ? null : Number(fila.compran_24h),
      // Of those who bought, how many never sat down.
      noShow:
        compraron && compraron > 0 && s1 !== null
          ? Math.max(0, (compraron - s1) / compraron)
          : null,
      caida1a2:
        s1 && s1 > 0 && s2 !== null && alcanzable(edad, 2) ? (s1 - s2) / s1 : null,
      grilla: armarGrilla(grillaRaw.rows),
      meses: disponibles,
    };
  });
}

/**
 * The drop grid: one row per cohort, one column per step between sessions.
 *
 * A cell is null when the cohort has not had time to reach the far side of the
 * step. The job stores a zero there — nobody has got that far yet, which is
 * true — and a zero drawn as a drop would read as "everybody left".
 */
function armarGrilla(
  filas: {
    cohorte: string;
    edad_dias: number;
    n: number;
    nro_sesion: number;
    pacientes: number;
  }[],
): FilaCohorte[] {
  const porCohorte = new Map<
    string,
    { n: number; edad: number; sesiones: Map<number, number> }
  >();

  for (const f of filas) {
    const c = porCohorte.get(f.cohorte) ?? {
      n: f.n,
      edad: f.edad_dias,
      sesiones: new Map<number, number>(),
    };
    c.sesiones.set(f.nro_sesion, f.pacientes);
    porCohorte.set(f.cohorte, c);
  }

  return [...porCohorte.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([cohorte, c]) => ({
      cohorte,
      n: c.n,
      pasos: Array.from({ length: ULTIMA_ETAPA - 1 }, (_, i) => {
        const desde = i + 1;
        const a = c.sesiones.get(desde);
        const b = c.sesiones.get(desde + 1);
        const maduro = alcanzable(c.edad, desde + 1);
        return {
          desde,
          caida: maduro && a && a > 0 && b !== undefined ? (a - b) / a : null,
        };
      }),
    }));
}

/** `edadDias` is measured from the day the cohort's month closed, not from its first day. */
function alcanzable(edadDias: number, nroSesion: number): boolean {
  return edadDias >= DIAS_PRIMERA_SESION + (nroSesion - 1) * DIAS_ENTRE_SESIONES;
}

/**
 * Days since the cohort's month ENDED, so the number holds for everyone in it,
 * including whoever signed up on the last day. Negative for a month still
 * running, which is clamped to zero: nothing about it is ready to read.
 */
function edadDeCohorte(mes: string): number {
  const [year, month] = mes.split("-").map(Number);
  const fin = Date.UTC(year!, month!, 1, 3);
  return Math.max(0, Math.floor((Date.now() - fin) / 86_400_000));
}

/**
 * The step that loses the most people, and whether it is getting better.
 *
 * "Better" is the three most recent cohorts old enough to have a value against
 * the three before them. With fewer than that it says nothing rather than
 * calling two months a trend.
 */
export function lecturaGrilla(grilla: FilaCohorte[]): string | null {
  if (grilla.length === 0) return null;

  const promedio = (paso: number) => {
    const valores = grilla
      .map((f) => f.pasos.find((p) => p.desde === paso)?.caida)
      .filter((v): v is number => v !== null && v !== undefined);
    return valores.length === 0
      ? null
      : valores.reduce((a, b) => a + b, 0) / valores.length;
  };

  let peor: { paso: number; valor: number } | null = null;
  for (let paso = 1; paso < ULTIMA_ETAPA; paso++) {
    const v = promedio(paso);
    if (v !== null && (peor === null || v > peor.valor)) peor = { paso, valor: v };
  }
  if (peor === null) return null;

  const serie = grilla
    .map((f) => f.pasos.find((p) => p.desde === peor!.paso)?.caida)
    .filter((v): v is number => v !== null && v !== undefined);

  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const base = `El salto más caro es de la ${peor.paso}ª a la ${peor.paso + 1}ª sesión: se pierde ${pct(peor.valor)} en promedio.`;

  if (serie.length < 4) return base;

  // The grid is newest first, so the head is recent and the tail is older.
  const recientes = serie.slice(0, 3);
  const previas = serie.slice(3, 6);
  const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const delta = media(recientes) - media(previas);

  if (Math.abs(delta) < 0.02) return `${base} Estable entre cohortes.`;
  return delta < 0
    ? `${base} Viene mejorando: ${pct(Math.abs(delta))} menos de caída que en las cohortes anteriores.`
    : `${base} Viene empeorando: ${pct(delta)} más de caída que en las cohortes anteriores.`;
}
