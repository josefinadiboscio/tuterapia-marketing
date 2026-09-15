-- Schema marketing: aggregate tables read by the dashboard.
--
-- Nothing here is exposed through PostgREST. The schema stays out of the API
-- surface and is read server-side with the service role key, so the public
-- publishable key cannot reach it. RLS is enabled with no policies as a second
-- lock: the service role bypasses it, everything else sees nothing.

create schema if not exists marketing;

-- Parameters with vigencia. Changing a value INSERTS a new row; the previous
-- one is never overwritten. The job looks up the value in force at the date of
-- the payment, not today's (METRICAS.md §3).
create table if not exists marketing.parametros (
  clave         text    not null check (clave in ('pct_comision', 'tipo_cambio')),
  pais          text    not null check (pais in ('AR', 'UY')),
  valor         numeric not null check (valor > 0),
  vigente_desde date    not null,
  cargado_en    timestamptz not null default now(),
  primary key (clave, pais, vigente_desde)
);

-- utm_source is a code with platform and country inside it, resolved by
-- pattern (METRICAS.md §7). `orden` breaks ties: several patterns can match the
-- same source ('tk%' and 'tiktok'), lowest wins.
create table if not exists marketing.utm_mapping (
  patron     text primary key,
  plataforma text    not null,
  superficie text,
  es_pago    boolean not null,
  orden      int     not null default 100,
  cargado_en timestamptz not null default now()
);

-- Monthly marketing spend, loaded by hand in Admin, already in USD.
create table if not exists marketing.gastos (
  mes        date    not null,
  pais       text    not null check (pais in ('AR', 'UY')),
  canal      text    not null,
  monto_usd  numeric not null check (monto_usd >= 0),
  cargado_en timestamptz not null default now(),
  primary key (mes, pais, canal)
);

-- The aggregate table behind every tab. If a number shows up in two places it
-- comes from here, never recomputed on the side (METRICAS.md §8).
--
-- `pais` and `plataforma` carry the literals 'TOTAL' and 'TODAS' for the
-- aggregate rows: Postgres does not accept nulls in a primary key, and a
-- median or a conversion rate cannot be summed by the UI anyway.
create table if not exists marketing.metricas_mensuales (
  mes                   date    not null,
  pais                  text    not null,
  plataforma            text    not null default 'TODAS',

  registros             int,
  pacientes_nuevos      int,
  pacientes_activos     int,

  conversion_cohorte    numeric,
  conversion_proyectada boolean not null default false,
  cohorte_edad_dias     int,

  mediana_dias_compra   numeric,
  p80_dias_compra       numeric,

  gasto_usd             numeric,
  cac_usd               numeric,

  -- The two LTV factors are stored apart, not only their product.
  sesiones_por_paciente numeric,
  margen_usd_sesion     numeric,
  ltv_usd               numeric,
  cohorte_cerrada       boolean not null default false,

  churn_rate            numeric,

  es_provisorio         boolean not null default true,
  actualizado_en        timestamptz not null default now(),
  primary key (mes, pais, plataforma)
);

create index if not exists metricas_mensuales_mes_idx
  on marketing.metricas_mensuales (mes desc);

-- Every run writes here, success or failure. Without it a dead cron goes
-- unnoticed for weeks; the dashboard header reads the last row.
create table if not exists marketing.sync_log (
  id             bigint generated always as identity primary key,
  corrida_en     timestamptz not null default now(),
  duracion_ms    int,
  meses          text[],
  filas          int,
  error          text
);

create index if not exists sync_log_corrida_en_idx
  on marketing.sync_log (corrida_en desc);

alter table marketing.parametros          enable row level security;
alter table marketing.utm_mapping         enable row level security;
alter table marketing.gastos              enable row level security;
alter table marketing.metricas_mensuales  enable row level security;
alter table marketing.sync_log            enable row level security;
