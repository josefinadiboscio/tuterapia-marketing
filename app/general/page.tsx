import Link from "next/link";
import { Nav, contexto, conContexto } from "@/components/nav";
import { GraficoSerie, type Serie } from "@/components/grafico-serie";
import { leerGeneral, type MesSerie, type VistaGeneral } from "@/lib/dashboard";
import { tendencia, lectura, MESES_TENDENCIA, type Tendencia } from "@/lib/tendencia";
import { entero, porcentaje, usd, SIN_DATO } from "@/lib/ui/format";

export const dynamic = "force-dynamic";

/**
 * Every metric on General, with how it is read and what it means. The
 * definition lives in the tooltip: the card shows the name, the value and the
 * trend, and nothing else.
 */
const VOLUMEN = [
  {
    id: "registros",
    nombre: "Registros",
    campo: (m: MesSerie) => m.registros,
    formato: (n: number | null) => entero(n),
    unidad: "pct" as const,
    definicion: "Cuentas creadas en el mes, excluyendo terapeutas.",
  },
  {
    id: "nuevos",
    nombre: "Pacientes nuevos",
    campo: (m: MesSerie) => m.pacientes_nuevos,
    formato: (n: number | null) => entero(n),
    unidad: "pct" as const,
    definicion:
      "Pacientes con su primer pago confirmado en el mes. Se cuentan en el mes de la venta.",
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
  const vista = await leerGeneral(ctx.pais, ctx.rango);

  const serieVol =
    VOLUMEN.find((m) => m.id === params.vol)?.id ?? VOLUMEN[0].id;
  const serieEco =
    ECONOMIA.find((m) => m.id === params.eco)?.id ?? ECONOMIA[0].id;

  const extra = { vol: serieVol, eco: serieEco };
  const cerrados = vista.serie.filter((m) => !m.es_provisorio);

  return (
    <>
      <Nav
        activa="/general"
        ctx={ctx}
        conRango
        extra={extra}
        ultimaSync={vista.ultimaSync}
      />

      <main className="mx-auto max-w-6xl px-6 py-8">
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
            />

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

            {vista.plataformas.length > 0 ? (
              <section className="mt-10">
                <h2 className="text-xs uppercase tracking-wide text-ter">
                  Registros por plataforma · {vista.serie.at(-1)?.mes}
                </h2>
                <ul className="mt-3 divide-y divide-borde-suave border-t border-borde">
                  {vista.plataformas.map((p) => {
                    const total =
                      vista.plataformas.reduce((a, x) => a + x.registros, 0) || 1;
                    const parte = p.registros / total;
                    return (
                      <li key={p.plataforma} className="py-1.5 text-sm">
                        <div className="flex items-baseline justify-between">
                          <span className="text-sec">{p.plataforma}</span>
                          <span className="flex items-baseline gap-6">
                            <span>{entero(p.registros)}</span>
                            <span className="w-14 text-right text-ter">
                              {porcentaje(parte)}
                            </span>
                          </span>
                        </div>
                        <div className="mt-1 h-1 w-full bg-borde-suave">
                          <div
                            className="h-1 bg-sage"
                            style={{ width: `${(parte * 100).toFixed(1)}%` }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}
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

  // Volume speaks green, economy speaks teal: two questions, two families.
  const familia =
    clave === "vol"
      ? { trazo: "stroke-sage", relleno: "fill-sage" }
      : { trazo: "stroke-teal", relleno: "fill-teal" };
  const segunda =
    clave === "vol"
      ? { trazo: "stroke-sage-light", relleno: "fill-sage-light" }
      : { trazo: "stroke-teal-deep", relleno: "fill-teal-deep" };

  const series: Serie[] = dividido
    ? porPais.map((p, i) => ({
        nombre: p.pais,
        puntos: aPuntos(p.serie, metrica),
        ...(i === 0 ? familia : segunda),
      }))
    : [
        {
          nombre: metrica.nombre,
          puntos: aPuntos(serie, metrica),
          ...familia,
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
        className={`mt-3 grid gap-px bg-borde-suave ${
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
          />
        ))}
      </div>

      <GraficoSerie
        series={series}
        tipo={tipo}
        techos={techos}
        formato={metrica.formato}
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
}: {
  metrica: Metrica;
  activa: boolean;
  href: string;
  serie: MesSerie[];
  cerrados: MesSerie[];
  porPais: VistaGeneral["porPais"];
}) {
  const dividido = porPais.length > 0;
  const ultimo = serie.at(-1);

  return (
    <Link
      href={href}
      title={metrica.definicion}
      className={`block bg-surface px-4 py-3 ${
        activa ? "ring-1 ring-acento" : "hover:bg-borde-suave"
      }`}
    >
      <p className="text-xs text-sec">{metrica.nombre}</p>

      {dividido ? (
        <div className="mt-1 space-y-1">
          {porPais.map((p) => (
            <div key={p.pais} className="flex items-baseline justify-between">
              <span className="text-xs text-sec">{p.pais}</span>
              <span className="text-lg text-texto">
                {metrica.formato(ultimoValor(p.serie, metrica.campo))}
              </span>
            </div>
          ))}
          {porPais.map((p) => (
            <TendenciaTexto
              key={`t-${p.pais}`}
              prefijo={p.pais}
              t={tendencia(
                p.serie
                  .filter((m) => !m.es_provisorio)
                  .slice(-MESES_TENDENCIA)
                  .map(metrica.campo),
                metrica.unidad,
              )}
            />
          ))}
        </div>
      ) : (
        <>
          <p className="mt-1 text-2xl text-texto">
            {metrica.formato(metrica.campo(ultimo ?? ({} as MesSerie)))}
          </p>
          <TendenciaTexto
            t={tendencia(
              cerrados.slice(-MESES_TENDENCIA).map(metrica.campo),
              metrica.unidad,
            )}
          />
        </>
      )}
    </Link>
  );
}

/**
 * The trend carries no colour: green is the brand, and a green "up" would make
 * both meanings unreadable. The word says the direction and the arrow repeats
 * it for anyone scanning.
 */
function TendenciaTexto({ t, prefijo }: { t: Tendencia; prefijo?: string }) {
  if (t.direccion === "sin_datos") {
    return (
      <p className="mt-1 text-xs text-ter">
        {prefijo ? `${prefijo} · ` : ""}sin datos suficientes
      </p>
    );
  }

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

function Lectura({
  vista,
  cerrados,
}: {
  vista: VistaGeneral;
  cerrados: MesSerie[];
}) {
  const ultimos = cerrados.slice(-MESES_TENDENCIA);
  const t = (campo: (m: MesSerie) => number | null, unidad: "pct" | "pp") =>
    tendencia(ultimos.map(campo), unidad);

  const ltv = ultimoValor(vista.serie, (m) => m.ltv_usd);
  const cac = ultimoValor(vista.serie, (m) => m.cac_usd);

  const texto = lectura({
    conversion: t((m) => m.conversion_cohorte, "pp"),
    registros: t((m) => m.registros, "pct"),
    nuevos: t((m) => m.pacientes_nuevos, "pct"),
    activos: t((m) => m.pacientes_activos, "pct"),
    cac: t((m) => m.cac_usd, "pct"),
    costoRegistro: t((m) => m.costo_por_registro_usd, "pct"),
    ltv: t((m) => m.ltv_usd, "pct"),
    ltvSobreCac: ltv !== null && cac !== null && cac > 0 ? ltv / cac : null,
  });

  if (!texto) return null;

  return (
    <p className="mt-4 border-l-2 border-gold bg-gold-soft px-3 py-2 text-sm text-texto">
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
