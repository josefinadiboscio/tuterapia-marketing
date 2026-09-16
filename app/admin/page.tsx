import { Nav, contextoDesde } from "@/components/nav";
import { leerAdmin } from "@/lib/admin";
import { entero, usd, fecha, fechaHora, nombreDeMes } from "@/lib/ui/format";
import {
  accionNuevaVigencia,
  accionGuardarGasto,
  accionGuardarPatron,
  accionBorrarPatron,
} from "./actions";

export const dynamic = "force-dynamic";

const CLAVES = ["tipo_cambio", "pct_comision"] as const;
const PAISES = ["AR", "UY"] as const;

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<{ pais?: string; mes?: string }>;
}) {
  const ctx = contextoDesde(await searchParams);
  const admin = await leerAdmin();
  const mesPorDefecto = admin.meses[0] ?? new Date().toISOString().slice(0, 7);

  return (
    <>
      <Nav activa="/admin" ctx={ctx} />

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-8">
        {/* Alerts first: they are the reason to open this screen. */}
        {(admin.faltantes.length > 0 || admin.sinMapear.length > 0) && (
          <section className="space-y-3">
            <Etiqueta>Pendientes</Etiqueta>

            {admin.faltantes.length > 0 && (
              <div className="border-l-2 border-amber-500 pl-3 text-sm">
                <p className="text-slate-900">
                  Falta el tipo de cambio de {admin.faltantes.length} mes
                  {admin.faltantes.length === 1 ? "" : "es"} cerrado
                  {admin.faltantes.length === 1 ? "" : "s"}. Sin eso el margen y
                  el LTV de esos meses quedan vacíos.
                </p>
                <p className="mt-1 tabular-nums text-slate-500">
                  {admin.faltantes
                    .slice(0, 8)
                    .map((f) => `${f.mes} ${f.pais}`)
                    .join(" · ")}
                  {admin.faltantes.length > 8
                    ? ` y ${admin.faltantes.length - 8} más`
                    : ""}
                </p>
              </div>
            )}

            {admin.sinMapear.length > 0 && (
              <div className="border-l-2 border-amber-500 pl-3 text-sm">
                <p className="text-slate-900">
                  {admin.sinMapear.length} utm_source sin mapear con volumen
                  relevante. Caen fuera de toda plataforma hasta que tengan un
                  patrón.
                </p>
                <ul className="mt-1 space-y-0.5 tabular-nums text-slate-500">
                  {admin.sinMapear.slice(0, 8).map((s) => (
                    <li key={`${s.utm_source}-${s.pais}`}>
                      {s.utm_source} · {s.pais} · {entero(s.registros)} registros
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {/* Gasto */}
        <section>
          <Etiqueta>Gasto mensual en USD</Etiqueta>

          <form
            action={accionGuardarGasto}
            className="mt-3 flex flex-wrap items-end gap-3 text-sm"
          >
            <Campo label="Mes">
              <input
                type="month"
                name="mes"
                defaultValue={mesPorDefecto}
                required
                className={INPUT}
              />
            </Campo>
            <Campo label="País">
              <select name="pais" className={INPUT}>
                {PAISES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Canal">
              <input
                name="canal"
                required
                placeholder="Meta"
                className={INPUT}
                list="plataformas"
              />
              <datalist id="plataformas">
                {[...new Set(admin.mapping.map((m) => m.plataforma))].map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Campo>
            <Campo label="Monto USD">
              <input
                type="number"
                name="monto_usd"
                min="0"
                step="0.01"
                required
                className={`${INPUT} tabular-nums`}
              />
            </Campo>
            <button type="submit" className={BOTON}>
              Guardar
            </button>
          </form>

          {admin.gastos.length > 0 ? (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-1 font-normal">Mes</th>
                  <th className="pb-1 font-normal">País</th>
                  <th className="pb-1 font-normal">Canal</th>
                  <th className="pb-1 text-right font-normal">Monto</th>
                  <th className="pb-1 text-right font-normal">Cargado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admin.gastos.map((g) => (
                  <tr key={`${g.mes}-${g.pais}-${g.canal}`}>
                    <td className="py-1.5 tabular-nums">{g.mes}</td>
                    <td className="py-1.5">{g.pais}</td>
                    <td className="py-1.5">{g.canal}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {usd(Number(g.monto_usd))}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-400">
                      {fecha(g.cargado_en)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Sin gasto cargado. Cargá un mes y el CAC aparece en General.
            </p>
          )}
        </section>

        {/* Parámetros */}
        <section>
          <Etiqueta>Parámetros vigentes</Etiqueta>
          <p className="mt-1 text-sm text-slate-500">
            Cambiar un valor inserta una vigencia nueva. La anterior no se toca:
            el job busca el valor vigente a la fecha que está costeando, no el de
            hoy.
          </p>

          <table className="mt-4 w-full max-w-xl text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-1 font-normal">Parámetro</th>
                <th className="pb-1 font-normal">País</th>
                <th className="pb-1 text-right font-normal">Valor</th>
                <th className="pb-1 text-right font-normal">Vigente desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admin.vigentes.map((p) => (
                <tr key={`${p.clave}-${p.pais}`}>
                  <td className="py-1.5">{p.clave}</td>
                  <td className="py-1.5">{p.pais}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.valor}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">
                    {p.vigente_desde}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            action={accionNuevaVigencia}
            className="mt-4 flex flex-wrap items-end gap-3 text-sm"
          >
            <Campo label="Parámetro">
              <select name="clave" className={INPUT}>
                {CLAVES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Campo>
            <Campo label="País">
              <select name="pais" className={INPUT}>
                {PAISES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </Campo>
            <Campo label="Valor">
              <input
                type="number"
                name="valor"
                step="0.0001"
                min="0"
                required
                className={`${INPUT} tabular-nums`}
              />
            </Campo>
            <Campo label="Vigente desde">
              <input type="date" name="vigente_desde" required className={INPUT} />
            </Campo>
            <button type="submit" className={BOTON}>
              Nueva vigencia
            </button>
          </form>
        </section>

        {/* UTMs */}
        <section>
          <Etiqueta>Mapeo de UTMs</Etiqueta>
          <p className="mt-1 text-sm text-slate-500">
            El patrón usa <code>%</code> como comodín. Cuando dos patrones
            coinciden con el mismo source gana el de menor orden.{" "}
            <span className="text-slate-900">Solo es_pago entra en Ads</span>{" "}
            como tráfico pago.
          </p>

          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-1 font-normal">Patrón</th>
                <th className="pb-1 font-normal">Plataforma</th>
                <th className="pb-1 font-normal">Superficie</th>
                <th className="pb-1 font-normal">Pago</th>
                <th className="pb-1 text-right font-normal">Orden</th>
                <th className="pb-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admin.mapping.map((m) => (
                <tr key={m.patron}>
                  <td className="py-1 font-mono text-xs">{m.patron}</td>
                  <td className="py-1">{m.plataforma}</td>
                  <td className="py-1 text-slate-500">{m.superficie ?? "—"}</td>
                  <td className="py-1">{m.es_pago ? "Sí" : "No"}</td>
                  <td className="py-1 text-right tabular-nums">{m.orden}</td>
                  <td className="py-1 text-right">
                    <form action={accionBorrarPatron}>
                      <input type="hidden" name="patron" value={m.patron} />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-red-600"
                      >
                        Borrar
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form
            action={accionGuardarPatron}
            className="mt-4 flex flex-wrap items-end gap-3 text-sm"
          >
            <Campo label="Patrón">
              <input name="patron" required placeholder="meta%" className={INPUT} />
            </Campo>
            <Campo label="Plataforma">
              <input name="plataforma" required placeholder="Meta" className={INPUT} />
            </Campo>
            <Campo label="Superficie">
              <input name="superficie" placeholder="ads" className={INPUT} />
            </Campo>
            <Campo label="Orden">
              <input
                type="number"
                name="orden"
                defaultValue={30}
                className={`${INPUT} w-20 tabular-nums`}
              />
            </Campo>
            <label className="flex items-center gap-1.5 pb-1">
              <input type="checkbox" name="es_pago" />
              <span>Es pago</span>
            </label>
            <button type="submit" className={BOTON}>
              Guardar patrón
            </button>
          </form>
        </section>

        {/* Historial */}
        <section>
          <Etiqueta>Historial de cambios</Etiqueta>
          {admin.historial.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              Sin cambios registrados todavía. Todo lo que cargues acá queda
              anotado con su valor anterior.
            </p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-1 font-normal">Qué</th>
                  <th className="pb-1 font-normal">De</th>
                  <th className="pb-1 font-normal">A</th>
                  <th className="pb-1 font-normal">Desde</th>
                  <th className="pb-1 text-right font-normal">Cargado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {admin.historial.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5">
                      {c.clave}
                      <span className="ml-2 text-xs text-slate-400">
                        {c.entidad}
                      </span>
                    </td>
                    <td className="py-1.5 tabular-nums text-slate-500">
                      {c.valor_anterior ?? "—"}
                    </td>
                    <td className="py-1.5 tabular-nums">{c.valor_nuevo ?? "—"}</td>
                    <td className="py-1.5 tabular-nums text-slate-500">
                      {c.vigente_desde ?? "—"}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-400">
                      {fechaHora(c.cargado_en)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="text-xs text-slate-400">
          Los parámetros se cargan por mes. El job usa el valor vigente al cierre
          del mes que está calculando, así que una vigencia que arranca a mitad
          de mes rige para ese mes entero.{" "}
          {admin.meses.length > 0
            ? `Hay ${admin.meses.length} meses sincronizados, de ${nombreDeMes(
                admin.meses[admin.meses.length - 1]!,
              )} a ${nombreDeMes(admin.meses[0]!)}.`
            : ""}
        </p>
      </main>
    </>
  );
}

const INPUT =
  "block border-b border-slate-300 bg-transparent py-1 text-sm outline-none focus:border-slate-900";
const BOTON =
  "border-b border-slate-900 pb-1 text-sm text-slate-900 hover:text-slate-600";

function Etiqueta({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs uppercase tracking-wide text-slate-400">{children}</h2>
  );
}

function Campo({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-slate-400">{label}</span>
      {children}
    </label>
  );
}
