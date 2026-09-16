-- The daily chart follows whichever card is selected, so the daily grain needs
-- the same four metrics the monthly one has.
alter table marketing.metricas_diarias
  add column if not exists pacientes_activos integer;
