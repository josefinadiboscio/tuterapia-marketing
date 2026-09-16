-- Daily grain, for Movimientos.
--
-- Separate from metricas_mensuales rather than a finer primary key on it: the
-- monthly table holds cohort metrics, margin and churn, none of which mean
-- anything on a single day. This one holds only what is countable daily.
create table if not exists marketing.metricas_diarias (
  fecha                 date not null,
  pais                  text not null,
  plataforma            text not null default 'TODAS',
  registros             int,
  pacientes_nuevos      int,
  conversion            numeric,
  conversion_proyectada boolean not null default false,
  cohorte_edad_dias     int,
  actualizado_en        timestamptz not null default now(),
  primary key (fecha, pais, plataforma)
);

create index if not exists metricas_diarias_fecha_idx
  on marketing.metricas_diarias (fecha desc);

alter table marketing.metricas_diarias enable row level security;
