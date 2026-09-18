-- Quién puede bajar datos personales, y qué bajó.
--
-- La grilla de caída pone una descarga a un clic de distancia en cada celda.
-- Eso es justo lo que la hace útil y también lo que la hace peligrosa: bajar
-- un padrón de pacientes en tratamiento deja de ser un acto deliberado y pasa
-- a ser un clic entre otros. Estas dos tablas son la contrapartida.

-- El permiso de exportar, separado del de leer.
--
-- Tener cuenta alcanza para ver todos los números del dashboard. No alcanza
-- para bajarse nombres y mails: eso es una decisión por persona y vive acá.
-- Una fila por cuenta habilitada; sin fila, no exporta.
create table if not exists marketing.permisos (
  usuario_id  uuid primary key,
  email       text not null,
  export_pii  boolean not null default false,
  otorgado_en timestamptz not null default now(),
  otorgado_por text
);

-- Qué se bajó, cuándo y quién.
--
-- Se escribe en cada descarga, antes de mandar el archivo. Si esta escritura
-- falla, la descarga no sale: una exportación sin registro es exactamente la
-- situación de la que veníamos.
create table if not exists marketing.export_log (
  id          bigint generated always as identity primary key,
  bajado_en   timestamptz not null default now(),
  usuario_id  uuid,
  email       text not null,
  cohorte     text,
  tramo       int,
  pais        text,
  filas       int not null
);

create index if not exists export_log_bajado_en_idx
  on marketing.export_log (bajado_en desc);

alter table marketing.permisos   enable row level security;
alter table marketing.export_log enable row level security;

-- Sin políticas: las dos tablas se leen y escriben solo por la conexión
-- directa de Postgres del server, igual que el resto del schema marketing.
-- La API de Supabase no las expone.
