-- Cost per registration: the month's spend over the month's registrations.
--
-- Stored next to CAC rather than derived in the UI, so both come from the same
-- row. Read together they separate the two reasons a CAC moves: the price of
-- the traffic, or how much of that traffic converts.
alter table marketing.metricas_mensuales
  add column if not exists costo_por_registro_usd numeric;
