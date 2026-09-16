import { withDb } from "@/lib/db";
import type { Client } from "pg";
import type { UtmMapping } from "@/lib/utm";

/**
 * Reads and writes for Admin. Every write also records what changed, from
 * what to what, and since when, because the question Admin answers six months
 * from now is "why did this number move".
 */

export type Parametro = {
  clave: string;
  pais: string;
  valor: string;
  vigente_desde: string;
  cargado_en: string;
};

export type Gasto = {
  mes: string;
  pais: string;
  canal: string;
  monto_usd: string;
  cargado_en: string;
};

export type SinMapear = {
  utm_source: string;
  pais: string;
  registros: number;
  meses: number;
};

export type Faltante = { mes: string; pais: string; clave: string };

export type Cambio = {
  id: string;
  entidad: string;
  clave: string;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  vigente_desde: string | null;
  cargado_en: string;
};

export type VistaAdmin = {
  parametros: Parametro[];
  vigentes: Parametro[];
  gastos: Gasto[];
  mapping: UtmMapping[];
  sinMapear: SinMapear[];
  faltantes: Faltante[];
  historial: Cambio[];
  meses: string[];
};

export async function leerAdmin(): Promise<VistaAdmin> {
  return withDb(async (db) => {
    const [parametros, vigentes, gastos, mapping, sinMapear, faltantes, historial, meses] =
      await Promise.all([
        db.query<Parametro>(
          `select clave, pais, valor::text, vigente_desde::text, cargado_en::text
             from marketing.parametros order by clave, pais, vigente_desde desc`,
        ),
        db.query<Parametro>(
          `select distinct on (clave, pais)
                  clave, pais, valor::text, vigente_desde::text, cargado_en::text
             from marketing.parametros
            where vigente_desde <= current_date
            order by clave, pais, vigente_desde desc`,
        ),
        db.query<Gasto>(
          `select to_char(mes, 'YYYY-MM') as mes, pais, canal,
                  monto_usd::text, cargado_en::text
             from marketing.gastos order by mes desc, pais, canal`,
        ),
        db.query<UtmMapping>(
          `select patron, plataforma, superficie, es_pago, orden
             from marketing.utm_mapping order by orden, patron`,
        ),
        // Volume behind each unmapped source, newest months first.
        db.query<SinMapear>(
          `select utm_source, pais, sum(registros)::int as registros,
                  count(*)::int as meses
             from marketing.utm_sin_mapear
            where mes >= (current_date - interval '6 months')
            group by utm_source, pais
            having sum(registros) >= 20
            order by registros desc limit 30`,
        ),
        // A closed month cannot be costed without the rate of its own month.
        db.query<Faltante>(
          `select to_char(m.mes, 'YYYY-MM') as mes, p.pais, 'tipo_cambio' as clave
             from (select distinct mes from marketing.metricas_mensuales
                    where es_provisorio = false) m
             cross join (values ('AR'), ('UY')) as p(pais)
            where not exists (
              select 1 from marketing.parametros par
               where par.clave = 'tipo_cambio' and par.pais = p.pais
                 and par.vigente_desde <= (m.mes + interval '1 month' - interval '1 day')
            )
            order by m.mes desc, p.pais`,
        ),
        db.query<Cambio>(
          `select id::text, entidad, clave, campo, valor_anterior, valor_nuevo,
                  vigente_desde::text, cargado_en::text
             from marketing.historial order by cargado_en desc limit 40`,
        ),
        db.query<{ mes: string }>(
          `select distinct to_char(mes, 'YYYY-MM') as mes
             from marketing.metricas_mensuales order by mes desc`,
        ),
      ]);

    return {
      parametros: parametros.rows,
      vigentes: vigentes.rows,
      gastos: gastos.rows,
      mapping: mapping.rows,
      sinMapear: sinMapear.rows,
      faltantes: faltantes.rows,
      historial: historial.rows,
      meses: meses.rows.map((r) => r.mes),
    };
  });
}

async function registrar(
  db: Client,
  cambio: {
    entidad: string;
    clave: string;
    campo?: string | null;
    anterior?: string | null;
    nuevo?: string | null;
    vigenteDesde?: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into marketing.historial
       (entidad, clave, campo, valor_anterior, valor_nuevo, vigente_desde)
     values ($1, $2, $3, $4, $5, $6)`,
    [
      cambio.entidad,
      cambio.clave,
      cambio.campo ?? null,
      cambio.anterior ?? null,
      cambio.nuevo ?? null,
      cambio.vigenteDesde ?? null,
    ],
  );
}

/**
 * A new vigencia is always an INSERT. There is no edit: the previous row stays
 * exactly as it was, because the job looks up the value in force at the date
 * it is costing, and rewriting history would silently restate closed months.
 */
export async function nuevaVigencia(
  clave: string,
  pais: string,
  valor: number,
  vigenteDesde: string,
): Promise<void> {
  await withDb(async (db) => {
    const { rows } = await db.query<{ valor: string }>(
      `select valor::text from marketing.parametros
        where clave = $1 and pais = $2 and vigente_desde < $3
        order by vigente_desde desc limit 1`,
      [clave, pais, vigenteDesde],
    );

    await db.query(
      `insert into marketing.parametros (clave, pais, valor, vigente_desde)
       values ($1, $2, $3, $4)
       on conflict (clave, pais, vigente_desde) do update set valor = excluded.valor`,
      [clave, pais, valor, vigenteDesde],
    );

    await registrar(db, {
      entidad: "parametro",
      clave: `${clave} ${pais}`,
      campo: "valor",
      anterior: rows[0]?.valor ?? null,
      nuevo: String(valor),
      vigenteDesde,
    });
  });
}

export async function guardarGasto(
  mes: string,
  pais: string,
  canal: string,
  montoUsd: number,
): Promise<void> {
  await withDb(async (db) => {
    const { rows } = await db.query<{ monto_usd: string }>(
      `select monto_usd::text from marketing.gastos
        where mes = $1 and pais = $2 and canal = $3`,
      [`${mes}-01`, pais, canal],
    );

    await db.query(
      `insert into marketing.gastos (mes, pais, canal, monto_usd)
       values ($1, $2, $3, $4)
       on conflict (mes, pais, canal)
       do update set monto_usd = excluded.monto_usd, cargado_en = now()`,
      [`${mes}-01`, pais, canal, montoUsd],
    );

    await registrar(db, {
      entidad: "gasto",
      clave: `${mes} ${pais} ${canal}`,
      campo: "monto_usd",
      anterior: rows[0]?.monto_usd ?? null,
      nuevo: String(montoUsd),
      vigenteDesde: `${mes}-01`,
    });
  });
}

export async function guardarPatron(patron: {
  patron: string;
  plataforma: string;
  superficie: string | null;
  es_pago: boolean;
  orden: number;
}): Promise<void> {
  await withDb(async (db) => {
    const { rows } = await db.query<UtmMapping>(
      `select patron, plataforma, superficie, es_pago, orden
         from marketing.utm_mapping where patron = $1`,
      [patron.patron],
    );
    const antes = rows[0];

    await db.query(
      `insert into marketing.utm_mapping (patron, plataforma, superficie, es_pago, orden)
       values ($1, $2, $3, $4, $5)
       on conflict (patron) do update set
         plataforma = excluded.plataforma,
         superficie = excluded.superficie,
         es_pago = excluded.es_pago,
         orden = excluded.orden`,
      [
        patron.patron,
        patron.plataforma,
        patron.superficie,
        patron.es_pago,
        patron.orden,
      ],
    );

    await registrar(db, {
      entidad: "utm_mapping",
      clave: patron.patron,
      campo: antes ? "mapeo" : "alta",
      anterior: antes
        ? `${antes.plataforma} · ${antes.superficie ?? "—"} · ${antes.es_pago ? "pago" : "orgánico"}`
        : null,
      nuevo: `${patron.plataforma} · ${patron.superficie ?? "—"} · ${patron.es_pago ? "pago" : "orgánico"}`,
    });
  });
}

export async function borrarPatron(patron: string): Promise<void> {
  await withDb(async (db) => {
    const { rows } = await db.query<UtmMapping>(
      `delete from marketing.utm_mapping where patron = $1
       returning patron, plataforma, superficie, es_pago, orden`,
      [patron],
    );
    if (rows.length === 0) return;

    await registrar(db, {
      entidad: "utm_mapping",
      clave: patron,
      campo: "baja",
      anterior: `${rows[0]!.plataforma} · ${rows[0]!.es_pago ? "pago" : "orgánico"}`,
      nuevo: null,
    });
  });
}
