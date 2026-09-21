-- Sesiones VENDIDAS por día, país y modalidad.
--
-- Vendidas, no realizadas. Son dos hechos distintos y el dashboard guarda los
-- dos por separado a propósito:
--
--   · `metricas_diarias.sesiones_realizadas` — cuándo OCURRIÓ la sesión.
--   · esta tabla — cuándo se PAGÓ el paquete que la contiene.
--
-- Comparten la palabra "sesiones" y nada más. Una venta es un paquete entero
-- que cae completo el día del pago, así que esta serie es dentada por
-- naturaleza: ocho sesiones compradas un martes son ocho de ese martes.
--
-- Grano propio y no una columna de `metricas_diarias` porque agrega un eje, la
-- modalidad, que ninguna otra métrica de esa tabla usa.
--
-- La ventana es de 120 días, más larga que los 45 del resto del grano diario:
-- la proyección a fin de mes necesita el patrón semanal de varios meses y el
-- panel necesita el cierre del mes anterior completo.
drop table if exists marketing.sesiones_diarias;

create table if not exists marketing.sesiones_vendidas (
  fecha        date not null,
  pais         text not null,
  -- online | presencial | sin_dato. `pacientes_pagos.tipo_session` es
  -- nullable y esa venta existió igual: se cuenta, no se descarta.
  modalidad    text not null,
  sesiones     int  not null,
  actualizado_en timestamptz not null default now(),
  primary key (fecha, pais, modalidad)
);

create index if not exists sesiones_vendidas_fecha_idx
  on marketing.sesiones_vendidas (fecha desc);

alter table marketing.sesiones_vendidas enable row level security;
