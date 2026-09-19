-- Los insights publicados, uno por fila.
--
-- La pantalla NO genera nada: lee esta tabla y la dibuja. Quien la llena es un
-- proceso aparte que corre una vez por día después de la sincronización. Esa
-- separación es deliberada: el dashboard tiene que seguir andando, mostrando
-- los insights de ayer, aunque el generador no corra.
--
-- Todo número citado sale de las tablas de agregados de `marketing`. Esta
-- tabla guarda el texto ya escrito y los números ya resueltos; no guarda
-- fórmulas ni se recalcula al leerla.

create table if not exists marketing.insights (
  id            bigint generated always as identity primary key,
  generado_en   timestamptz not null default now(),

  -- El día al que corresponde el análisis, en día local (UTC−3).
  fecha         date not null,
  -- TOTAL, AR o UY. La pantalla filtra por acá.
  pais          text not null,
  -- general, ads, funnel o cruce. "cruce" es el que toca más de un dominio y
  -- es el más valioso: conecta pantallas que se miran por separado.
  dominio       text not null,
  -- alerta (algo empeoró), oportunidad, observacion.
  severidad     text not null,
  -- Los de "Lo más importante hoy". Como mucho dos.
  destacado     boolean not null default false,

  /*
   * La identidad del HALLAZGO, no de la fila.
   *
   * Dos corridas que encuentran la misma cosa producen el mismo hash aunque
   * el texto salga redactado distinto. Es lo que permite no repetir ayer y
   * respetar un descarte.
   */
  hash          text not null,

  titular       text not null,
  cuerpo        text not null,
  recomendacion text,

  /*
   * Los números citados, con su valor anterior y actual.
   * [{ "etiqueta": "CAC AR", "antes": "18,4", "ahora": "23,1", "fuente": "metricas_mensuales" }]
   *
   * `fuente` no es decorativa: si un número no puede decir de qué tabla
   * salió, el insight no se publica.
   */
  datos         jsonb not null default '[]'::jsonb,
  -- [{ "href": "/ads?pais=AR", "texto": "Ver en Ads" }]
  enlaces       jsonb not null default '[]'::jsonb,
  -- Qué métricas toca, para poder auditar después qué se citó.
  metricas      text[] not null default '{}',

  estado        text not null default 'activo',
  descartado_en timestamptz,

  -- Cuando un hallazgo vuelve porque empeoró, apunta a la vez anterior.
  agravado_de   bigint references marketing.insights(id),

  constraint insights_pais_ok
    check (pais in ('TOTAL', 'AR', 'UY')),
  constraint insights_dominio_ok
    check (dominio in ('general', 'ads', 'funnel', 'cruce')),
  constraint insights_severidad_ok
    check (severidad in ('alerta', 'oportunidad', 'observacion')),
  constraint insights_estado_ok
    check (estado in ('activo', 'descartado'))
);

-- Un hallazgo no se escribe dos veces el mismo día para el mismo país.
-- Hace idempotente al generador: si corre dos veces, no duplica.
create unique index if not exists insights_dia_idx
  on marketing.insights (fecha, pais, hash);

-- La pantalla siempre pide lo último de un país.
create index if not exists insights_pantalla_idx
  on marketing.insights (pais, fecha desc, estado);

-- El generador pregunta "¿este hallazgo ya apareció?" por hash y fecha.
create index if not exists insights_hash_idx
  on marketing.insights (hash, fecha desc);

alter table marketing.insights enable row level security;
