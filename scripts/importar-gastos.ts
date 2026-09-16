/**
 * Importa el gasto semanal desde el CSV de Growth Control.
 *
 *   node --experimental-strip-types scripts/importar-gastos.ts <archivo.csv>
 *
 * Necesita SUPABASE_DB_PASSWORD en el entorno, igual que la app.
 *
 * Es idempotente: agrega por (semana, país, canal) antes de escribir y hace
 * upsert con el valor, no suma. Correrlo dos veces deja la base igual que
 * correrlo una.
 */
import { readFileSync } from "node:fs";
import { withDb } from "../lib/db.ts";

/** Los canales de la planilla, mapeados a las plataformas de utm_mapping. */
const CANALES: Record<string, string> = {
  "Google Ads": "Google Ads",
  Meta: "Meta",
  "Tik Tok": "TikTok",
  // Es una campaña de Meta. El nombre original sobrevive en canal_csv.
  "Meta Sueños": "Meta",
};

/** Chile está fuera del dashboard (METRICAS.md §1). */
const PAISES = new Set(["AR", "UY"]);

type Fila = { semana: string; pais: string; canal: string; monto: number; origen: Set<string> };

function parsearFecha(valor: string): string {
  const [dia, mes, anio] = valor.trim().split("/").map(Number);
  if (!dia || !mes || !anio) throw new Error(`Fecha ilegible: ${valor}`);
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Un CSV con comas adentro de comillas: "1,59" es un número, no dos campos. */
function celdas(linea: string): string[] {
  const salida: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (const caracter of linea) {
    if (caracter === '"') entreComillas = !entreComillas;
    else if (caracter === "," && !entreComillas) {
      salida.push(actual);
      actual = "";
    } else actual += caracter;
  }
  salida.push(actual);
  return salida;
}

function leerCsv(ruta: string) {
  const lineas = readFileSync(ruta, "utf8").split(/\r?\n/).filter(Boolean);
  const encabezado = celdas(lineas[0]!).map((c) => c.trim());
  const indice = (nombre: string) => {
    const i = encabezado.indexOf(nombre);
    if (i === -1) throw new Error(`Falta la columna "${nombre}" en el CSV`);
    return i;
  };

  const col = {
    semana: indice("Semana"),
    pais: indice("Pais"),
    canal: indice("Canal"),
    gasto: indice("Gasto USD"),
  };

  const agregadas = new Map<string, Fila>();
  const descartadas = { pais: 0, canal: new Set<string>() };

  for (const linea of lineas.slice(1)) {
    const campos = celdas(linea);
    const pais = campos[col.pais]!.trim();
    if (!PAISES.has(pais)) {
      descartadas.pais++;
      continue;
    }

    const canalCsv = campos[col.canal]!.trim();
    const canal = CANALES[canalCsv];
    if (!canal) {
      descartadas.canal.add(canalCsv);
      continue;
    }

    const semana = parsearFecha(campos[col.semana]!);
    const monto = Number(campos[col.gasto]!.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(monto)) throw new Error(`Gasto ilegible en ${semana} ${pais} ${canalCsv}`);

    const clave = `${semana}|${pais}|${canal}`;
    const previa = agregadas.get(clave);
    if (previa) {
      previa.monto += monto;
      previa.origen.add(canalCsv);
    } else {
      agregadas.set(clave, { semana, pais, canal, monto, origen: new Set([canalCsv]) });
    }
  }

  return { filas: [...agregadas.values()], descartadas };
}

async function main() {
  const ruta = process.argv[2];
  if (!ruta) {
    console.error("Uso: node --experimental-strip-types scripts/importar-gastos.ts <archivo.csv>");
    process.exit(1);
  }

  const { filas, descartadas } = leerCsv(ruta);
  if (descartadas.canal.size > 0) {
    console.error(`Canales sin mapear, no se importaron: ${[...descartadas.canal].join(", ")}`);
    process.exit(1);
  }

  await withDb(async (db) => {
    for (const fila of filas) {
      await db.query(
        `insert into marketing.gastos (semana, pais, canal, monto_usd, canal_csv)
         values ($1, $2, $3, $4, $5)
         on conflict (semana, pais, canal) do update set
           monto_usd = excluded.monto_usd,
           canal_csv = excluded.canal_csv,
           cargado_en = now()`,
        [fila.semana, fila.pais, fila.canal, fila.monto, [...fila.origen].sort().join(" + ")],
      );
    }
  });

  const semanas = new Set(filas.map((f) => f.semana)).size;
  const total = filas.reduce((a, f) => a + f.monto, 0);
  console.log(
    `${filas.length} filas en ${semanas} semanas, US$ ${total.toFixed(0)}. ` +
      `${descartadas.pais} filas descartadas por país.`,
  );
  console.log("Recordá correr el job para que el CAC se recalcule con el gasto nuevo.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
