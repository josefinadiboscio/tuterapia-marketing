-- Spend moves to the weekly grain it is actually planned at.
--
-- Aggregating to month on import would throw away the detail Ads needs to
-- judge a campaign, and a month can always be rebuilt from its weeks. The
-- reverse is not true.
--
-- The old monthly table was empty, so nothing is lost by replacing it.
drop table if exists marketing.gastos;

create table marketing.gastos (
  semana     date    not null,
  pais       text    not null check (pais in ('AR', 'UY')),
  canal      text    not null,
  monto_usd  numeric not null check (monto_usd >= 0),
  -- The label as it came from the sheet, kept when it maps onto a broader
  -- platform: 'Meta Sueños' becomes Meta for the dashboard, and the original
  -- name survives here for Ads.
  canal_csv  text,
  cargado_en timestamptz not null default now(),
  primary key (semana, pais, canal)
);

create index if not exists gastos_semana_idx on marketing.gastos (semana desc);

alter table marketing.gastos enable row level security;
