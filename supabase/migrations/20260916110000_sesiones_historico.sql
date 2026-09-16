-- Sessions an average patient has done over their whole life at Tu Terapia,
-- as of the end of each month.
--
-- Not the same as sesiones_por_paciente, which is the LTV multiplier and only
-- counts what a registration cohort does inside its first 90 days. That one has
-- to be windowed or an older cohort would always look better for having had
-- longer; this one is meant to drift, because it is the tenure of the whole
-- patient base.
alter table marketing.metricas_mensuales
  add column if not exists sesiones_historico numeric;
