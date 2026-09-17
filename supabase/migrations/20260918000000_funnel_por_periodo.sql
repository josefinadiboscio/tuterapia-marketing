-- El Funnel medido sobre compradores, con el día de compra como cohorte.
--
-- La pantalla vieja seguía cohortes de registro mes a mes. La nueva sigue
-- compradores sobre un período libre (90 / 180 / 365 días), y cada etapa se
-- calcula sobre los compradores que tuvieron tiempo de llegar a ella. Para eso
-- la cohorte tiene que ser el DÍA de la compra, no el mes: la fecha de corte de
-- madurez de una etapa cae en un día cualquiera.
--
-- `marketing.cohorte_sesiones` se queda donde está: es la cohorte de registro
-- mensual y de ahí sale la exportación de cohorte (/api/funnel/csv). Son dos
-- preguntas distintas y no se pisan.
--
-- OJO, y es una excepción a la regla de "nunca recalcular un mes cerrado": una
-- cohorte de compradores sigue moviéndose para siempre. Quien compró en marzo
-- puede hacer su sexta sesión en septiembre, así que la fila de marzo cambia
-- esta noche. El job reescribe una ventana móvil hacia atrás (ver
-- lib/sync-funnel.ts) en lugar de tocar solo el mes en curso. Los agregados
-- mensuales de marketing.metricas_mensuales siguen intactos: esa regla es
-- para ellos.

-- Cuántos compradores de cada día llegaron a cada sesión.
-- nro_sesion = 0 es la compra: la base del embudo, el 100%.
-- Acumulativa por construcción: quien hizo seis sesiones cuenta en 1 a 6, así
-- que la caída entre dos etapas es una división y nada más.
create table marketing.funnel_etapas (
  fecha_compra   date        not null,
  pais           text        not null check (pais in ('AR', 'UY')),
  nro_sesion     int         not null check (nro_sesion between 0 and 12),
  pacientes      int         not null check (pacientes >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (fecha_compra, pais, nro_sesion)
);

-- Días entre una etapa y la siguiente, como histograma.
--
-- Histograma y no mediana ya guardada: una mediana no se suma. Con la
-- distribución, la mediana y el p80 de cualquier ventana salen exactos, y el
-- costo es chico porque un día tiene pocos compradores y por lo tanto pocos
-- valores distintos.
--
-- tramo 0 = compra -> 1ª sesión, 1 = 1ª -> 2ª, ... 5 = 5ª -> 6ª.
-- Los días se cuentan en día local (UTC-3), igual que todo el resto.
create table marketing.funnel_tiempos (
  fecha_compra   date        not null,
  pais           text        not null check (pais in ('AR', 'UY')),
  tramo          int         not null check (tramo between 0 and 5),
  dias           int         not null check (dias >= 0),
  pacientes      int         not null check (pacientes >= 0),
  actualizado_en timestamptz not null default now(),
  primary key (fecha_compra, pais, tramo, dias)
);

alter table marketing.funnel_etapas enable row level security;
alter table marketing.funnel_tiempos enable row level security;

-- La lectura siempre es "un rango de días de compra, para uno o dos países".
create index funnel_etapas_rango on marketing.funnel_etapas (fecha_compra, pais);
create index funnel_tiempos_rango on marketing.funnel_tiempos (fecha_compra, pais);
