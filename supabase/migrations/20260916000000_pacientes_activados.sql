-- Activados: patients whose first realized session falls in the month.
--
-- Pacientes nuevos counts the sale; this counts the first time the patient
-- actually sat down. The distance between the two is the no-show rate, which
-- is a Funnel question, so the column is stored here and not shown in General.
alter table marketing.metricas_mensuales
  add column if not exists pacientes_activados int;
