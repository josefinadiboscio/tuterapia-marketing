-- Spend moves to the daily grain and becomes editable from Ads.
--
-- It was loaded weekly from a sheet. A free date range cannot be answered from
-- weeks without splitting one, so the day is the grain now and a week is the
-- sum of its days.
create table marketing.gastos_diarios (
  fecha          date not null,
  pais           text not null check (pais in ('AR', 'UY')),
  -- Meta, Google Ads, TikTok. Instagram never has its own row: it is covered
  -- by Meta's spend and evaluated as one unit of investment with it.
  plataforma     text not null,
  monto_usd      numeric not null check (monto_usd >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (fecha, pais, plataforma)
);

create index if not exists gastos_diarios_fecha_idx
  on marketing.gastos_diarios (fecha desc);

alter table marketing.gastos_diarios enable row level security;

-- A hand-written note on a campaign code. metaarj7 says nothing on its own.
create table marketing.utm_descripcion (
  utm_source     text not null primary key,
  descripcion    text not null,
  actualizado_en timestamptz not null default now()
);

alter table marketing.utm_descripcion enable row level security;

-- Sessions realized per day, for the margin the period generated. Distinct
-- from pacientes_activos, which counts people: two sessions by one patient is
-- one active patient and two sessions of margin.
alter table marketing.metricas_diarias
  add column if not exists sesiones_realizadas integer;

-- Carry the weekly spend over, spread flat across each week's seven days.
-- A flat spread is the only split that preserves the totals without inventing
-- a daily pattern nobody recorded. Editing a day from Ads replaces it.
insert into marketing.gastos_diarios (fecha, pais, plataforma, monto_usd)
select g.semana + d, g.pais, g.canal, g.monto_usd / 7.0
  from marketing.gastos g
  cross join generate_series(0, 6) as d
on conflict (fecha, pais, plataforma) do nothing;
