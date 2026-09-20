-- La severidad pasa a medir tamaño de oportunidad, no nivel de alarma.
--
-- Antes: alerta / oportunidad / observacion, con el coral de alerta al frente.
-- Una pestaña que abre con tres cosas en rojo enseña a no abrirla.
--
-- Ahora dos estados y nada más: `alta` es donde está la oportunidad más grande
-- y se pinta naranja; `normal` es el resto y va en neutro. El coral sale de
-- esta pestaña — acá no hay alarmas, hay palancas ordenadas por tamaño.
--
-- Lo que NO cambia: si algo empeoró se sigue diciendo con su número. Lo que
-- cambia es que se presenta junto a lo que se gana al resolverlo.
alter table marketing.insights
  drop constraint if exists insights_severidad_ok;

update marketing.insights
   set severidad = case
     when severidad in ('alerta') then 'alta'
     else 'normal'
   end
 where severidad in ('alerta', 'oportunidad', 'observacion');

alter table marketing.insights
  add constraint insights_severidad_ok
  check (severidad in ('alta', 'normal'));
