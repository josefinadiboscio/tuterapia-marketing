-- Sesiones realizadas por día, país y modalidad.
--
-- Grano propio y no una columna más de `metricas_diarias` porque agrega un
-- eje: la modalidad. Meterla ahí obligaría a multiplicar la clave por una
-- dimensión que ninguna otra métrica de esa tabla usa.
--
-- `metricas_diarias.sesiones_realizadas` sigue existiendo y sale de ESTA misma
-- consulta, sumando las modalidades. Un solo origen, dos granos: no se pueden
-- contradecir.
--
-- La ventana es más larga que los 45 días del resto del grano diario. La
-- proyección a fin de mes necesita el patrón semanal de varios meses, y el
-- panel necesita el cierre del mes anterior completo.
create table if not exists marketing.sesiones_diarias (
  fecha        date not null,
  pais         text not null,
  -- online | presencial | sin_dato. La columna de origen es nullable y una
  -- sesión sin modalidad ocurrió igual: se cuenta, no se descarta.
  modalidad    text not null,
  sesiones     int  not null,
  actualizado_en timestamptz not null default now(),
  primary key (fecha, pais, modalidad)
);

create index if not exists sesiones_diarias_fecha_idx
  on marketing.sesiones_diarias (fecha desc);

alter table marketing.sesiones_diarias enable row level security;
