-- The campaign grain at the monthly scale, for the tooltip on the monthly
-- chart.
--
-- marketing.metricas_utm only covers the last 45 days, which is what the daily
-- chart needs. The monthly chart goes back twelve, so it needs its own grain
-- rather than a sum of days that do not exist.
--
-- Same shape as the daily table, and the same rule: the source stays raw and
-- the mapping to a platform is applied when reading.
alter table marketing.metricas_utm
  add column if not exists pacientes_activos integer;

create table marketing.metricas_utm_mensual (
  mes              date not null,
  pais             text not null check (pais in ('AR', 'UY')),
  utm_source       text not null,
  registros        integer,
  pacientes_nuevos integer,
  pacientes_activos integer,
  convertidos      integer,
  actualizado_en   timestamptz not null default now(),
  primary key (mes, pais, utm_source)
);

create index if not exists metricas_utm_mensual_mes_idx
  on marketing.metricas_utm_mensual (mes desc);

alter table marketing.metricas_utm_mensual enable row level security;
