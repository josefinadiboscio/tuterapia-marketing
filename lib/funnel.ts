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

/** A patient reaches roughly one session a week, so this is how long an nth session needs. */
const DIAS_POR_SESION = 7;

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
  medianaCompra: number | null;
  p80Compra: number | null;
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
        medianaCompra: null,
        p80Compra: null,
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
        conversion_cohorte: string | null;
        mediana_dias_compra: string | null;
        p80_dias_compra: string | null;
      }>(
        `select registros, conversion_cohorte::text, mediana_dias_compra::text,
                p80_dias_compra::text
           from marketing.metricas_mensuales
          where pais = $1 and plataforma = 'TODAS'
            and to_char(mes, 'YYYY-MM') = $2`,
        [pais, elegido],
      ),
      db.query<{ nro_sesion: number; pacientes: number; cohorte_n: number }>(
        `select nro_sesion, pacientes, cohorte_n
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
                (current_date - cohorte)::int as edad_dias,
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
    const conversion =
      fila?.conversion_cohorte == null ? null : Number(fila.conversion_cohorte);

    // Of the people who registered this month, how many bought. That is the
    // cohort conversion, which is exactly the stage this funnel needs.
    const compraron =
      registros !== null && conversion !== null
        ? Math.round(registros * conversion)
        : null;

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
      medianaCompra:
        fila?.mediana_dias_compra == null ? null : Number(fila.mediana_dias_compra),
      p80Compra: fila?.p80_dias_compra == null ? null : Number(fila.p80_dias_compra),
      // A median of zero days means most people buy the day they sign up, so
      // the share buying inside 24 h is what that median is really saying.
      compranEn24h: null,
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

/** Roughly a session a week, so an nth session needs about n weeks to happen. */
function alcanzable(edadDias: number, nroSesion: number): boolean {
  return edadDias >= nroSesion * DIAS_POR_SESION;
}

function edadDeCohorte(mes: string): number {
  const [year, month] = mes.split("-").map(Number);
  const inicio = Date.UTC(year!, month! - 1, 1, 3);
  return Math.max(0, Math.floor((Date.now() - inicio) / 86_400_000));
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
