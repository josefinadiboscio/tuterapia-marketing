-- Of the registration cohort, how many ever bought, with no window.
--
-- conversion_cohorte asks how many bought within thirty days, which is a
-- question about speed. The funnel asks how far the cohort got, with no clock.
-- Using the windowed number at the purchase stage drew a funnel whose session
-- stage was larger than the purchase stage above it, because someone who signed
-- up in April and paid in July counts as a session but not as a sale.
alter table marketing.cohorte_sesiones
  add column if not exists cohorte_compraron integer;
