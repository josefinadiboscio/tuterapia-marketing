-- Admin: what the job reads and what a person loads by hand.

-- Audit trail for everything Admin writes. Parameters already carry their own
-- history through vigencia, but gastos and utm_mapping do not, and "who
-- changed what, from what to what, since when" is the question Admin exists to
-- answer when a number moves.
create table if not exists marketing.historial (
  id             bigint generated always as identity primary key,
  entidad        text not null check (entidad in ('parametro', 'gasto', 'utm_mapping')),
  clave          text not null,
  campo          text,
  valor_anterior text,
  valor_nuevo    text,
  vigente_desde  date,
  cargado_en     timestamptz not null default now()
);

create index if not exists historial_cargado_en_idx
  on marketing.historial (cargado_en desc);

-- utm_source values no pattern matched, with the volume behind them. The
-- dashboard never queries MySQL, so the job writes what it found and Admin
-- reads it from here. The mapping stays up to date on its own only if the
-- gaps are visible.
create table if not exists marketing.utm_sin_mapear (
  mes          date not null,
  pais         text not null,
  utm_source   text not null,
  registros    int  not null,
  detectado_en timestamptz not null default now(),
  primary key (mes, pais, utm_source)
);

alter table marketing.historial      enable row level security;
alter table marketing.utm_sin_mapear enable row level security;
