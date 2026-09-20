-- La conversión del tramo transcurrido, en el mes en curso y en el anterior.
--
-- `conversion_cohorte` no se puede comparar contra un mes cerrado mientras el
-- mes corre: el que se registró ayer tuvo un día de sus treinta y arrastra el
-- número para abajo por calendario. Estas dos columnas son la misma definición
-- truncada en el mismo punto de observación para los dos meses, que es lo
-- único que hace comparable "cómo viene" contra "cómo venía".
--
-- Se llenan solo en el mes provisorio. En un mes cerrado quedan nulas, porque
-- ahí `conversion_cohorte` ya es la respuesta.
alter table marketing.metricas_mensuales
  add column if not exists conversion_tramo        numeric,
  add column if not exists conversion_tramo_previo numeric;
