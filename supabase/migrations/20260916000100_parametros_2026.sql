-- Parameters in force from 2026-01-01.
--
-- pct_comision repeats the values already seeded from 2020: a new vigencia is
-- inserted, never an update, so the history stays readable even when the
-- number does not change.
--
-- tipo_cambio for Uruguay is deliberately absent. METRICAS.md §3 asks for the
-- rate actually used to convert or remit, not the official one, and that is a
-- business value nobody should guess. Until it is loaded, UY margin and LTV
-- stay null rather than wrong.
insert into marketing.parametros (clave, pais, valor, vigente_desde)
values ('pct_comision', 'AR', 0.26, '2026-01-01'),
       ('pct_comision', 'UY', 0.30, '2026-01-01'),
       ('tipo_cambio',  'AR', 1550, '2026-01-01')
on conflict (clave, pais, vigente_desde) do update set valor = excluded.valor;
