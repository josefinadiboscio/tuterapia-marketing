-- The utm_source grain, which Ads needs and nothing stored.
--
-- metricas_diarias groups by plataforma, so the campaign level was gone by the
-- time anything was written. This keeps the raw source, and the platform level
-- is the sum of its sources: the two levels of the Ads screen come from one
-- table and cannot disagree.
--
-- The mapping from source to platform stays out on purpose. It lives in
-- marketing.utm_mapping and is applied when reading, so fixing a pattern today
-- regroups every day already stored instead of requiring a resync.
--
-- Conversion is stored as its two parts rather than as a rate: rates cannot be
-- added, so a platform built from its sources needs the numerator and the
-- denominator, not an average of averages.
create table marketing.metricas_utm (
  fecha          date not null,
  pais           text not null check (pais in ('AR', 'UY')),
  -- '' is traffic that arrived with no tag. It is a real bucket, not a gap.
  utm_source     text not null,
  registros      integer,
  pacientes_nuevos integer,
  -- Cohort of the day's registrations: how many of them bought within the
  -- conversion window. Denominator is registros.
  convertidos    integer,
  actualizado_en timestamptz not null default now(),
  primary key (fecha, pais, utm_source)
);

create index if not exists metricas_utm_fecha_idx
  on marketing.metricas_utm (fecha desc);

alter table marketing.metricas_utm enable row level security;
