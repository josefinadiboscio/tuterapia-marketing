-- How far each cohort gets, session by session.
--
-- metricas_mensuales says how many patients did a first session and stops
-- there, so the funnel could not answer the question it exists to answer:
-- where do people stop coming back. One row per (cohort, country, nth
-- session) carrying how many patients of that cohort reached that session.
--
-- The count is cumulative by construction: a patient who did six sessions is
-- counted in rows 1 through 6. That makes the drop between two steps a plain
-- division, and it makes every row readable on its own.
--
-- Counted to session 12. The funnel shows ten; the two extra give the last
-- displayed step something to fall to, so the tenth bar is not the edge of the
-- data pretending to be the edge of the behaviour.
--
-- A recent cohort has not had time to reach the later sessions. That is not a
-- zero and must never be stored as one: the row simply does not exist, and the
-- grid draws those cells dotted.
create table marketing.cohorte_sesiones (
  -- First day of the registration month, local time (UTC-3), same convention
  -- as every other cohort in the schema.
  cohorte        date     not null,
  pais           text     not null check (pais in ('AR', 'UY', 'TOTAL')),
  nro_sesion     smallint not null check (nro_sesion between 1 and 12),
  pacientes      integer  not null check (pacientes >= 0),
  -- The cohort's own size, repeated on every row so a percentage never needs a
  -- second table to be computed.
  cohorte_n      integer  not null check (cohorte_n >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (cohorte, pais, nro_sesion)
);

create index if not exists cohorte_sesiones_cohorte_idx
  on marketing.cohorte_sesiones (cohorte desc);

alter table marketing.cohorte_sesiones enable row level security;
