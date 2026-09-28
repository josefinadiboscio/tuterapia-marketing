-- Lo que consumió una creatividad, leído a mano de Meta y cargado acá.
--
-- Es una lectura de odómetro, no un gasto de un día: `acumulado_usd` es el
-- total que esa creatividad consumió DESDE QUE ARRANCÓ hasta `hasta`. Dos
-- lecturas seguidas dan, restando, lo que gastó en el tramo entre las dos.
--
-- Por qué así y no un gasto diario como marketing.gasto_vigente: nadie sabe lo
-- que una creatividad gastó ayer, pero el total acumulado está a la vista en el
-- administrador de anuncios y se copia sin hacer ninguna cuenta. Un número que
-- hay que calcular antes de cargarlo se carga mal o no se carga.
--
-- Una fila por lectura, nunca un update: la lectura del 28 de septiembre sigue
-- siendo verdad después de cargar la del 30 de octubre. Misma regla de vigencia
-- que marketing.parametros y marketing.gasto_vigente.
--
-- El país va en la clave porque la misma etiqueta podría existir en los dos
-- mercados, y porque el LTV con el que se juzga el retorno es distinto en cada
-- uno.
create table marketing.gasto_campana (
  pais          text    not null check (pais in ('AR', 'UY')),
  utm_source    text    not null,
  hasta         date    not null,
  acumulado_usd numeric not null check (acumulado_usd >= 0),
  cargado_en    timestamptz not null default now(),
  primary key (pais, utm_source, hasta)
);

alter table marketing.gasto_campana enable row level security;

comment on column marketing.gasto_campana.acumulado_usd is
  'Total consumido por la creatividad desde que arrancó hasta la fecha `hasta`, no el gasto de ese día.';
