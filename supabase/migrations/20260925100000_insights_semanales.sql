-- Los insights pasan de diarios a semanales.
--
-- La unidad deja de ser la tarjeta y pasa a ser el ANÁLISIS DE LA SEMANA: un
-- tema principal y dos o tres notas más breves. Seis tarjetas por día era una
-- pestaña que pedía atención todos los días y la gastaba; una vez por semana
-- con una sola cosa importante se lee.
--
-- Dos cambios de forma:
--
--   · `fecha` pasa a ser `semana`, y guarda el LUNES de la semana cerrada que
--     se analizó. No es la fecha de generación: el análisis del lunes 28 habla
--     de la semana del 21 al 27, y lo que se muestra en pantalla es el período
--     analizado, no cuándo corrió el job.
--   · `destacado` (booleano) pasa a `rol`, con dos valores: `tema` y `nota`.
--     Un booleano admitía seis destacados; un rol con un único `tema` por
--     semana y país dice la regla en el esquema en vez de confiar en que el
--     generador la respete.
alter table marketing.insights
  rename column fecha to semana;

alter table marketing.insights
  add column if not exists rol text not null default 'nota';

update marketing.insights
   set rol = case when destacado then 'tema' else 'nota' end;

alter table marketing.insights
  drop column if exists destacado;

alter table marketing.insights
  add constraint insights_rol_ok check (rol in ('tema', 'nota'));

-- Las filas viejas eran diarias. Se llevan al lunes de su propia semana para
-- que el archivo no arranque con un agujero.
update marketing.insights
   set semana = semana - ((extract(isodow from semana)::int - 1) * interval '1 day');

-- Un solo tema por semana y país. La regla vive acá, no en el prompt.
create unique index if not exists insights_un_tema_idx
  on marketing.insights (semana, pais)
  where rol = 'tema' and estado = 'activo';

-- El índice de pantalla ahora ordena por semana.
drop index if exists marketing.insights_pantalla_idx;
create index if not exists insights_pantalla_idx
  on marketing.insights (pais, semana desc, estado);

drop index if exists marketing.insights_dia_idx;
create unique index if not exists insights_semana_idx
  on marketing.insights (semana, pais, hash);
