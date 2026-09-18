import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import {
  GraficoSerie,
  type Serie,
  type FormatoId,
} from "@/components/grafico-serie";
import { GraficoDiario } from "@/components/grafico-diario";
import {
  leerDesgloseDiario,
  leerDesgloseMensual,
  type Desglose,
  type MetricaSerie,
} from "@/lib/desglose";
import { leerGeneral, type MesSerie, type VistaGeneral } from "@/lib/dashboard";
import { tendencia, lectura, MESES_TENDENCIA, type Tendencia } from "@/lib/tendencia";
import {
  entero,
  porcentaje,
  usd,
  decimal,
  mesCorto,
  SIN_DATO,
} from "@/lib/ui/format";
import { identidadDe, colorDe, colorPlataforma } from "@/components/identidad";

export const dynamic = "force-dynamic";

/**
 * Every metric on General, with how it is read and what it means. The
 * definition lives in the tooltip: the card shows the name, the value and the
 * trend, and nothing else.
 */
const VOLUMEN = [
  {
    id: "nuevos",
    nombre: "Pacientes nuevos",
    campo: (m: MesSerie) => m.pacientes_nuevos,
    tramo: (m: MesSerie) => m.pacientes_nuevos_tramo_previo,
    formato: (n: number | null) => entero(n),
    formatoId: "entero" as const,
    unidad: "pct" as const,
    definicion:
      "Pacientes con su primer pago confirmado en el mes. Se cuentan en el mes de la venta.",
  },
  {
    id: "registros",
    nombre: "Registros",
    campo: (m: MesSerie) => m.registros,
    tramo: (m: MesSerie) => m.registros_tramo_previo,
    formato: (n: number | null) => entero(n),
    formatoId: "entero" as const,
    unidad: "pct" as const,
    definicion: "Cuentas creadas en el mes, excluyendo terapeutas.",
  },
  {
    id: "activos",
    nombre: "Pacientes activos",
    campo: (m: MesSerie) => m.pacientes_activos,
    formato: (n: number | null) => entero(n),
    formatoId: "entero" as const,
    unidad: "pct" as const,
    definicion: "Pacientes con al menos una sesión realizada en el mes.",
  },
  {
    id: "conversion",
    nombre: "Conversión",
    campo: (m: MesSerie) => m.conversion_cohorte,
    formato: (n: number | null) => porcentaje(n),
    formatoId: "porcentaje" as const,
    unidad: "pp" as const,
    definicion:
      "De los que se registraron en el mes, cuántos compraron dentro de los 30 días.",
  },
] as const;

const ECONOMIA = [
  {
    id: "cac",
    nombre: "CAC",
    campo: (m: MesSerie) => m.cac_usd,
    formato: (n: number | null) => usd(n, 1),
    formatoId: "usd" as const,
    unidad: "pct" as const,
    definicion:
      "Gasto de marketing del mes sobre los pacientes nuevos del mes, en dólares.",
  },
  {
    id: "costo_registro",
    nombre: "Costo por registro",
    campo: (m: MesSerie) => m.costo_por_registro_usd,
    formato: (n: number | null) => usd(n, 1),
    formatoId: "usd" as const,
    unidad: "pct" as const,
    definicion:
      "Gasto del mes sobre los registros del mes. Es el precio del tráfico, antes de convertir.",
  },
  {
    id: "sesiones",
    nombre: "Sesiones por paciente",
    campo: (m: MesSerie) => m.sesiones_historico,
    formato: (n: number | null) => decimal(n),
    formatoId: "decimal" as const,
    unidad: "pct" as const,
    // Against the month before, not a six-month slope: this drifts by tenths,
    // and a slope over tenths reads as noise.
    contraMesPrevio: true,
    definicion:
      "Sesiones realizadas que hace un paciente a lo largo de toda su vida en Tu Terapia, sobre todos los que hicieron al menos una.",
  },
] as const;

/** The volume cards and the series columns use different names for the same thing. */
function metricaDiaria(vol: string | undefined): MetricaSerie {
  if (vol === "registros") return "registros";
  if (vol === "activos") return "activos";
  if (vol === "conversion") return "conversion";
  return "nuevos";
}

export default async function General({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const [vista, diario, mensual] = await Promise.all([
    leerGeneral(ctx.pais, ctx.rango),
    leerDesgloseDiario(ctx.pais, metricaDiaria(params.vol)),
    leerDesgloseMensual(ctx.pais, metricaDiaria(params.vol), ctx.rango),
  ]);

  const serieVol =
    VOLUMEN.find((m) => m.id === params.vol)?.id ?? VOLUMEN[0].id;
  const serieEco =
    ECONOMIA.find((m) => m.id === params.eco)?.id ?? ECONOMIA[0].id;

  const extra = { vol: serieVol, eco: serieEco };
  const cerrados = vista.serie.filter((m) => !m.es_provisorio);

  return (
    <>
      <Nav activa="/general" ctx={ctx} />
      <Selectores activa="/general" ctx={ctx} conRango extra={extra} />

      <main className="contenedor pb-8 pt-6">
        {vista.serie.length === 0 ? (
          <p className="text-sm text-sec">
            No hay datos sincronizados para {ctx.pais}. Corré el job y volvé.
          </p>
        ) : (
          <>
            <Bloque
              titulo="Volumen"
              metricas={VOLUMEN}
              seleccionada={serieVol}
              clave="vol"
              ctx={ctx}
              extra={extra}
              serie={vista.serie}
              cerrados={cerrados}
              tipo="barras"
              porPais={vista.porPais}
              mensual={mensual}
            />

            {/* Between the two blocks: the daily composition the monthly
                aggregate hides. */}
            <section className="mt-8">
              {/* The title follows the selected card: the chart draws whatever
                  the cards are pointing at, so a fixed title would lie. */}
              <h2 className="text-xs uppercase tracking-wide text-ter">
                {VOLUMEN.find((m) => m.id === serieVol)!.nombre} por plataforma ·
                30 días
              </h2>
              <GraficoDiario
                datos={diario}
                rate={serieVol === "conversion"}
                titulo={VOLUMEN.find((m) => m.id === serieVol)!.nombre}
              />
            </section>

            <Bloque
              titulo="Economía"
              metricas={ECONOMIA}
              seleccionada={serieEco}
              clave="eco"
              ctx={ctx}
              extra={extra}
              serie={vista.serie}
              cerrados={cerrados}
              tipo="linea"
              porPais={vista.porPais}
              techoLtv={serieEco === "cac"}
              lectura={<Lectura vista={vista} cerrados={cerrados} />}
            />

          </>
        )}
      </main>
    </>
  );
}

type Metrica = {
  id: string;
  nombre: string;
  campo: (m: MesSerie) => number | null;
  /**
   * The same stretch of the previous month, when the metric is a sum over the
   * month and the comparison is therefore like for like.
   *
   * Pacientes activos has no reader here on purpose: it is a distinct count
   * over a window, so half a month does not hold half the patients and the
   * delta would read as a collapse that never happened.
   */
  tramo?: (m: MesSerie) => number | null;
  formato: (n: number | null) => string;
  /** The same format, as a name: a function cannot cross into the chart. */
  formatoId: FormatoId;
  /**
   * Compare against the month before instead of a six-month slope. For a
   * number that drifts by tenths, a slope over tenths reads as noise.
   */
  contraMesPrevio?: boolean;
  unidad: "pct" | "pp";
  definicion: string;
};

function Bloque({
  titulo,
  metricas,
  seleccionada,
  clave,
  ctx,
  extra,
  serie,
  cerrados,
  tipo,
  porPais = [],
  mensual,
  techoLtv = false,
  lectura,
}: {
  titulo: string;
  metricas: readonly Metrica[];
  seleccionada: string;
  clave: "vol" | "eco";
  ctx: Awaited<ReturnType<typeof contexto>>;
  extra: Record<string, string>;
  serie: MesSerie[];
  cerrados: MesSerie[];
  tipo: "barras" | "linea";
  porPais?: VistaGeneral["porPais"];
  /** Platform series and raw sources, for the country view and the tooltip. */
  mensual?: Desglose;
  techoLtv?: boolean;
  lectura?: React.ReactNode;
}) {
  const metrica = metricas.find((m) => m.id === seleccionada)!;
  const dividido = clave === "eco" && porPais.length > 0;

  // The metric carries its colour from its card into the chart.
  const color = colorDe(metrica.id);
  const borde = color.borde;

  // A rate cannot be stacked: adding 8,7% to 12,5% is not a number.
  //
  // What the bars are split by follows the country selector. On TOTAL they
  // stack by country, which is the composition of the total. With one country
  // chosen there is no second country to show, so they stack by platform —
  // the same colours the daily chart uses, so a platform is one colour across
  // the whole screen.
  const apilable = metrica.unidad === "pct";
  const porPaises = clave === "vol" ? porPais : [];
  const apilaPorPais = apilable && porPaises.length > 1;
  const plataformas = mensual?.plataformas ?? [];
  const apilaPorPlataforma =
    apilable && !apilaPorPais && clave === "vol" && plataformas.length > 0;
  const apiladas = apilaPorPais || apilaPorPlataforma;

  const series: Serie[] = apilaPorPais
    ? porPaises.map((p, i) => ({
        nombre: p.pais,
        puntos: aPuntos(p.serie, metrica),
        trazo: color.trazo,
        relleno: color.relleno,
        atenuada: i > 0,
      }))
    : apilaPorPlataforma
    ? plataformas.map((nombre, i) => ({
        nombre,
        puntos: serie.map((m) => ({
          mes: m.mes,
          valor:
            mensual!.barras.find(
              (b) => b.periodo === m.mes && b.clave === nombre,
            )?.valor ?? null,
          enCurso: m.es_provisorio,
        })),
        trazo: colorPlataforma(i).replace("bg-", "stroke-"),
        relleno: colorPlataforma(i).replace("bg-", "fill-"),
      }))
    : dividido
      ? porPais.map((p, i) => ({
          nombre: p.pais,
          puntos: aPuntos(p.serie, metrica),
          trazo: color.trazo,
          relleno: color.relleno,
          atenuada: i > 0,
        }))
      : [
          {
            nombre: metrica.nombre,
            puntos: aPuntos(serie, metrica),
            trazo: color.trazo,
            relleno: color.relleno,
          },
        ];

  const techos = techoLtv
    ? (dividido ? porPais : [{ pais: ctx.pais, serie }])
        .map((p) => {
          const ltv = ultimoValor(p.serie, (m) => m.ltv_usd);
          return ltv === null
            ? null
            : { valor: ltv, etiqueta: `LTV ${p.pais} ${usd(ltv, 1)}` };
        })
        .filter((t): t is { valor: number; etiqueta: string } => t !== null)
    : [];

  return (
    <section className="mt-2 first:mt-0 [&+section]:mt-8">
      <h2 className="text-xs uppercase tracking-wide text-ter">{titulo}</h2>

      <div
        className={`mt-3 grid gap-[10px] ${
          metricas.length === 4 ? "md:grid-cols-4" : "md:grid-cols-3"
        }`}
      >
        {metricas.map((m) => (
          <Card
            key={m.id}
            metrica={m}
            activa={m.id === seleccionada}
            href={conContexto("/general", ctx, { ...extra, [clave]: m.id })}
            serie={serie}
            cerrados={cerrados}
            porPais={clave === "eco" ? porPais : []}
            borde={borde}
          />
        ))}
      </div>

      <GraficoSerie
        series={series}
        tipo={tipo}
        techos={techos}
        formatoId={metrica.formatoId}
        identidad={identidadDe(ctx.pais)}
        apiladas={apiladas}
        utm={clave === "vol" ? (mensual?.utm ?? []) : []}
        rate={metrica.unidad === "pp"}
      />

      {lectura}
    </section>
  );
}

function Card({
  metrica,
  activa,
  href,
  serie,
  cerrados,
  porPais,
  borde,
}: {
  metrica: Metrica;
  activa: boolean;
  href: string;
  serie: MesSerie[];
  cerrados: MesSerie[];
  porPais: VistaGeneral["porPais"];
  borde: string;
}) {
  const dividido = porPais.length > 0;
  const ultimo = serie.at(-1);

  return (
    <Link
      href={href}
      title={metrica.definicion}
      className={`block rounded-lg border bg-surface px-3 py-2.5 transition-colors ${
        activa ? borde : "border-borde hover:border-sec"
      }`}
    >
      <p className="text-xs text-sec">{metrica.nombre}</p>

      {dividido ? (
        <>
          {/* On TOTAL the economy block shows one country large and the other
              small: averaging two markets with different commission, duration
              and LTV describes neither. */}
          <p className="mt-0.5 text-xl text-texto">
            {metrica.formato(ultimoValor(porPais[0]!.serie, metrica.campo))}
          </p>
          <p className="mt-0.5 text-xs text-sec">
            {porPais[0]!.pais} · {porPais[1]!.pais}{" "}
            {metrica.formato(ultimoValor(porPais[1]!.serie, metrica.campo))}
          </p>
          {metrica.contraMesPrevio ? (
            <DeltaMesPrevio serie={porPais[0]!.serie} metrica={metrica} />
          ) : (
            <TendenciaCard
              serie={porPais[0]!.serie.filter((m) => !m.es_provisorio)}
              metrica={metrica}
            />
          )}
        </>
      ) : (
        <>
          <p className="mt-0.5 text-xl text-texto">
            {metrica.formato(ultimoValor(serie, metrica.campo))}
          </p>
          <DeltaCard ultimo={ultimo} cerrados={cerrados} metrica={metrica} />
        </>
      )}
    </Link>
  );
}

/**
 * The other half of the LTV: how many sessions an average patient of the
 * cohort does, and which way it is going.
 *
 * LTV is this number times the margin a session leaves. Shown on its own
 * because the two move for different reasons — a price change is not the same
 * news as patients coming back more often — and the product alone cannot tell
 * which one moved.
 *
 * Reads the last month that HAS a value, the same one the LTV above it is
 * showing: both are null until the cohort closes at ninety days.
 */
/**
 * How much the number moved since last month, in its own units.
 *
 * For a figure that drifts by tenths — the lifetime sessions a patient does —
 * a six-month slope in percent reads as noise. "+0,2" says the thing itself.
 */
function DeltaMesPrevio({
  serie,
  metrica,
}: {
  serie: MesSerie[];
  metrica: Metrica;
}) {
  const cerrados = serie.filter((m) => !m.es_provisorio);
  const valor = ultimoValor(cerrados, metrica.campo);
  const previo = ultimoValor(cerrados.slice(0, -1), metrica.campo);
  if (valor === null || previo === null) return null;

  const delta = valor - previo;

  // Two different questions, and a month can answer them opposite ways: the
  // month can fall while the half-year still climbs. The slope says where it
  // is going, the delta says what just happened.
  const t = tendencia(
    cerrados.slice(-MESES_TENDENCIA).map(metrica.campo),
    metrica.unidad,
  );
  const rumbo =
    t.direccion === "sin_datos"
      ? null
      : t.direccion === "creciendo"
        ? { texto: `subiendo en ${t.meses}m`, tono: "text-forest" }
        : t.direccion === "bajando"
          ? { texto: `bajando en ${t.meses}m`, tono: "text-coral" }
          : { texto: `estable en ${t.meses}m`, tono: "text-sec" };

  const estancado = Math.abs(delta) < 0.05;
  const uno = Math.abs(delta).toFixed(1).replace(".", ",");

  return (
    <>
      <p
        className={`mt-1 text-xs ${
          estancado ? "text-sec" : delta > 0 ? "text-forest" : "text-coral"
        }`}
      >
        {estancado ? "→ igual que" : `${delta > 0 ? "↑ +" : "↓ −"}${uno} vs.`} el
        mes anterior
      </p>
      {rumbo ? <p className={`text-xs ${rumbo.tono}`}>{rumbo.texto}</p> : null}
    </>
  );
}

/**
 * While the month is running, the card compares it against the same stretch of
 * the month before rather than against a six-month slope.
 *
 * Half of September against all of August says the month is collapsing, which
 * is only ever true of the calendar. Against the first fifteen days of August
 * it says something real, so that is the comparison the card makes, and it
 * names the stretch so nobody has to guess what it is against.
 */
function DeltaCard({
  ultimo,
  cerrados,
  metrica,
}: {
  ultimo: MesSerie | undefined;
  cerrados: MesSerie[];
  metrica: Metrica;
}) {
  if (metrica.contraMesPrevio) {
    return <DeltaMesPrevio serie={cerrados} metrica={metrica} />;
  }

  const previo = ultimo && metrica.tramo ? metrica.tramo(ultimo) : null;
  const actual = ultimo ? metrica.campo(ultimo) : null;

  if (
    ultimo?.es_provisorio &&
    previo !== null &&
    previo > 0 &&
    actual !== null
  ) {
    const cambio = actual / previo - 1;
    const tono =
      cambio > 0 ? "text-forest" : cambio < 0 ? "text-coral" : "text-sec";
    const flecha = cambio > 0 ? "↑" : cambio < 0 ? "↓" : "→";
    return (
      <p className={`mt-0.5 truncate text-xs ${tono}`}>
        {flecha} {cambio >= 0 ? "+" : "−"}
        {Math.abs(cambio * 100).toFixed(0)}% vs. mismos {ultimo.tramo_dias} días
        de {mesCorto(mesPrevio(ultimo.mes))}
      </p>
    );
  }

  return <TendenciaCard serie={cerrados} metrica={metrica} />;
}

/** No value, no trend: a dash and nothing else, never an explanation. */
function TendenciaCard({
  serie,
  metrica,
}: {
  serie: MesSerie[];
  metrica: Metrica;
}) {
  const t = tendencia(
    serie.slice(-MESES_TENDENCIA).map(metrica.campo),
    metrica.unidad,
  );
  if (t.direccion === "sin_datos") return null;
  return <TendenciaTexto t={t} />;
}

/**
 * The trend carries no colour: green is the brand, and a green "up" would make
 * both meanings unreadable. The word says the direction and the arrow repeats
 * it for anyone scanning.
 */
function TendenciaTexto({ t, prefijo }: { t: Tendencia; prefijo?: string }) {
  const flecha =
    t.direccion === "creciendo" ? "↑" : t.direccion === "bajando" ? "↓" : "→";

  const cambio =
    t.cambio === null
      ? SIN_DATO
      : t.unidad === "pp"
        ? `${t.cambio >= 0 ? "+" : "−"}${Math.abs(t.cambio * 100).toFixed(1)} pp`
        : `${t.cambio >= 0 ? "+" : "−"}${Math.abs(t.cambio * 100).toFixed(0)}%`;

  const tono =
    t.direccion === "creciendo"
      ? "text-forest"
      : t.direccion === "bajando"
        ? "text-coral"
        : "text-sec";

  return (
    <p className={`mt-1 text-xs ${tono}`}>
      {prefijo ? `${prefijo} · ` : ""}
      {flecha} {t.direccion} · {cambio} en {t.meses}m
    </p>
  );
}

/**
 * The sentence reads the same series the cards show.
 *
 * Volume adds across countries, so it reads the TOTAL row. Economy does not:
 * with TOTAL selected the cards show each country separately, so the sentence
 * takes the first one and says whose numbers it is talking about. Reading a
 * blended CAC would be the average this dashboard refuses to show.
 */
function Lectura({
  vista,
  cerrados,
}: {
  vista: VistaGeneral;
  cerrados: MesSerie[];
}) {
  const economia = vista.porPais[0]?.serie ?? vista.serie;
  const prefijo = vista.porPais.length > 0 ? `${vista.porPais[0]!.pais} · ` : "";

  const ultimos = cerrados.slice(-MESES_TENDENCIA);
  const ultimosEco = economia
    .filter((m) => !m.es_provisorio)
    .slice(-MESES_TENDENCIA);

  const t = (campo: (m: MesSerie) => number | null, unidad: "pct" | "pp") =>
    tendencia(ultimos.map(campo), unidad);
  const te = (campo: (m: MesSerie) => number | null) =>
    tendencia(ultimosEco.map(campo), "pct");

  const ltv = ultimoValor(economia, (m) => m.ltv_usd);
  const cac = ultimoValor(economia, (m) => m.cac_usd);

  const texto = lectura({
    conversion: t((m) => m.conversion_cohorte, "pp"),
    registros: t((m) => m.registros, "pct"),
    nuevos: t((m) => m.pacientes_nuevos, "pct"),
    activos: t((m) => m.pacientes_activos, "pct"),
    cac: te((m) => m.cac_usd),
    costoRegistro: te((m) => m.costo_por_registro_usd),
    ltv: te((m) => m.ltv_usd),
    ltvSobreCac: ltv !== null && cac !== null && cac > 0 ? ltv / cac : null,
  });

  if (!texto) return null;

  return (
    <p className="mt-4 border-l-2 border-gold bg-gold-soft px-3 py-2 text-sm text-texto">
      {prefijo}
      {texto}
    </p>
  );
}

function aPuntos(serie: MesSerie[], metrica: Metrica) {
  return serie.map((m) => ({
    mes: m.mes,
    valor: metrica.campo(m),
    enCurso: m.es_provisorio,
  }));
}

function ultimoValor(
  serie: MesSerie[],
  campo: (m: MesSerie) => number | null,
): number | null {
  for (let i = serie.length - 1; i >= 0; i--) {
    const v = campo(serie[i]!);
    if (v !== null) return v;
  }
  return null;
}

/** '2026-09' → '2026-08'. The card names the month it compares against. */
function mesPrevio(mes: string): string {
  const [year, month] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(year!, month! - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
