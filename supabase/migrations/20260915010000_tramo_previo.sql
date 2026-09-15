-- Same-stretch comparison for a month still running.
--
-- A month in progress carries no delta against the whole previous month:
-- fifteen days against thirty reads as a collapse that is not there. Instead
-- the job measures the same stretch of the previous month — the first fifteen
-- days — and stores it here, so the dashboard compares like with like and
-- still never recomputes anything on its own.
--
-- Only filled while es_provisorio is true; null on closed months, which use
-- the ordinary month-over-month delta.
alter table marketing.metricas_mensuales
  add column if not exists registros_tramo_previo         int,
  add column if not exists pacientes_nuevos_tramo_previo  int,
  add column if not exists pacientes_activos_tramo_previo int,
  add column if not exists tramo_dias                     int;
