-- What is being spent per day, declared once per platform and country.
--
-- Loading a figure for every single day was the wrong shape: the spend is a
-- rate, not a diary. One row says "Google Ads in Argentina costs 30 dollars a
-- day from this date", and every day from there takes it. Changing the number
-- changes every day it covers, which is what "change it and everything
-- changes" has to mean.
--
-- Same vigencia pattern as marketing.parametros: a new value inserts a new row
-- and never overwrites the previous one, so a past period keeps the rate it
-- actually had.
create table marketing.gasto_vigente (
  pais          text    not null check (pais in ('AR', 'UY')),
  plataforma    text    not null,
  monto_usd     numeric not null check (monto_usd >= 0),
  vigente_desde date    not null,
  cargado_en    timestamptz not null default now(),
  primary key (pais, plataforma, vigente_desde)
);

alter table marketing.gasto_vigente enable row level security;

insert into marketing.gasto_vigente (pais, plataforma, monto_usd, vigente_desde)
values
  ('AR', 'Google Ads',  30, '2026-09-17'),
  ('UY', 'Google Ads',  16, '2026-09-17'),
  ('AR', 'TikTok',      20, '2026-09-17'),
  ('AR', 'Meta',       250, '2026-09-17'),
  ('UY', 'Meta',       125, '2026-09-17'),
  -- Cero declarado, no dato faltante: TikTok Uruguay se dejó de pautar.
  -- Vacío y cero se leen igual en la pantalla, y no son lo mismo.
  ('UY', 'TikTok',       0, '2026-09-17');
