import Link from "next/link";
import { Nav, Selectores, contexto, conContexto } from "@/components/nav";
import { GraficoSerie, type Serie } from "@/components/grafico-serie";
import { GraficoDiario } from "@/components/grafico-diario";
import { leerDiarioPorPlataforma } from "@/lib/diario";
import { leerGeneral, type MesSerie, type VistaGeneral } from "@/lib/dashboard";
import { tendencia, lectura, MESES_TENDENCIA, type Tendencia } from "@/lib/tendencia";
import { entero, porcentaje, usd, SIN_DATO } from "@/lib/ui/format";
import { identidadDe, colorDe } from "@/components/identidad";

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
    unidad: "pct" as const,
    definicion: "Cuentas creadas en el mes, excluyendo terapeutas.",
  },
  {
    id: "activos",
    nombre: "Pacientes activos",
    campo: (m: MesSerie) => m.pacientes_activos,
    formato: (n: number | null) => entero(n),
    unidad: "pct" as const,
    definicion: "Pacientes con al menos una sesión realizada en el mes.",
  },
  {
    id: "conversion",
    nombre: "Conversión",
    campo: (m: MesSerie) => m.conversion_cohorte,
    formato: (n: number | null) => porcentaje(n),
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
    unidad: "pct" as const,
    definicion:
      "Gasto de marketing del mes sobre los pacientes nuevos del mes, en dólares.",
  },
  {
    id: "costo_registro",
    nombre: "Costo por registro",
    campo: (m: MesSerie) => m.costo_por_registro_usd,
    formato: (n: number | null) => usd(n, 1),
    unidad: "pct" as const,
    definicion:
      "Gasto del mes sobre los registros del mes. Es el precio del tráfico, antes de convertir.",
  },
  {
    id: "ltv",
    nombre: "LTV",
    campo: (m: MesSerie) => m.ltv_usd,
    formato: (n: number | null) => usd(n, 1),
    unidad: "pct" as const,
    definicion:
      "Sesiones por paciente sobre cohorte cerrada, por el margen en dólares de cada sesión.",
  },
] as const;

export default async function General({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const ctx = await contexto(params);
  const [vista, diario] = await Promise.all([
    leerGeneral(ctx.pais, ctx.rango),
    leerDiarioPorPlataforma(ctx.pais),
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

      <main className="mx-auto max-w-6xl px-6 pb-8 pt-6">
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
            />

            {/* Between the two blocks: the daily composition the monthly
                aggregate hides. */}
            <section className="mt-12">
              <h2 className="text-xs uppercase tracking-wide text-ter">
                Registros por plataforma · 30 días
              </h2>
              <GraficoDiario
                filas={diario.filas}
                plataformas={diario.plataformas}
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
  techoLtv?: boolean;
  lectura?: React.ReactNode;
}) {
  const metrica = metricas.find((m) => m.id === seleccionada)!;
  const dividido = clave === "eco" && porPais.length > 0;

  // The metric carries its colour from its card into the chart.
  const color = colorDe(metrica.id);
  const borde = color.borde;

  // A rate cannot be stacked: adding 8,7% to 12,5% is not a number. Counts
  // stack by country so the composition of the total stays visible.
  const apilable = metrica.unidad === "pct";
  const porPaises = clave === "vol" ? porPais : [];
  const apiladas = apilable && porPaises.length > 1;

  const series: Serie[] = apiladas
    ? porPaises.map((p, i) => ({
        nombre: p.pais,
        puntos: aPuntos(p.serie, metrica),
        trazo: color.trazo,
        relleno: color.relleno,
        atenuada: i > 0,
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
    <section className="mt-2 first:mt-0 [&+section]:mt-12">
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
        formato={metrica.formato}
        identidad={identidadDe(ctx.pais)}
        apiladas={apiladas}
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
      className={`block rounded-lg border bg-surface px-4 py-3 transition-colors ${
        activa ? borde : "border-borde hover:border-sec"
      }`}
    >
      <p className="text-xs text-sec">{metrica.nombre}</p>

      {dividido ? (
        <>
          {/* On TOTAL the economy block shows one country large and the other
              small: averaging two markets with different commission, duration
              and LTV describes neither. */}
          <p className="mt-1 text-2xl text-texto">
            {metrica.formato(ultimoValor(porPais[0]!.serie, metrica.campo))}
          </p>
          <p className="mt-0.5 text-xs text-sec">
            {porPais[0]!.pais} · {porPais[1]!.pais}{" "}
            {metrica.formato(ultimoValor(porPais[1]!.serie, metrica.campo))}
          </p>
          <TendenciaCard
            serie={porPais[0]!.serie.filter((m) => !m.es_provisorio)}
            metrica={metrica}
          />
        </>
      ) : (
        <>
          <p className="mt-1 text-2xl text-texto">
            {metrica.formato(ultimoValor(serie, metrica.campo))}
          </p>
          <DeltaCard ultimo={ultimo} cerrados={cerrados} metrica={metrica} />
        </>
      )}
    </Link>
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
      <p className={`mt-1 text-xs ${tono}`}>
        {flecha} {cambio >= 0 ? "+" : "−"}
        {Math.abs(cambio * 100).toFixed(0)}% vs. los primeros{" "}
        {ultimo.tramo_dias} días del mes anterior
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
