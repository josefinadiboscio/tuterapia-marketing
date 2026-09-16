-- Days from signing up to the first realized session, and the share who pay
-- within 24 h.
--
-- mediana_dias_compra measures the distance to the first payment, which is a
-- click and happens the same day for most people: median 0, p80 3. The funnel
-- is about the distance to sitting down with a therapist, which needs a slot in
-- a diary and runs three to five days with a p80 near two weeks. Two correct
-- measurements of two different things; the funnel needed the second one.
alter table marketing.metricas_mensuales
  add column if not exists mediana_dias_sesion numeric,
  add column if not exists p80_dias_sesion numeric,
  add column if not exists compran_24h numeric;
