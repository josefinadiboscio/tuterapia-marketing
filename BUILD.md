# BUILD.md — Plan de construcción

Fases en orden. **Cada fase termina en un checkpoint del usuario.** No avanzar
sin que la anterior esté validada: un error en las queries se hereda hacia
arriba y se descubre semanas después, cuando ya no se sabe de dónde viene.

Al terminar cada fase, parar y reportar qué se hizo y qué hay que verificar.

---

## Fase 0 — Esqueleto y prueba de conexión

Proyecto Next.js con App Router y TypeScript en la raíz del repo.

- `app/api/cron/sync/route.ts`: valida
  `Authorization: Bearer ${process.env.CRON_SECRET}`, devuelve 401 si no
  coincide. Si coincide, conecta a MySQL con `mysql2/promise` leyendo
  `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD` y
  `MYSQL_DATABASE` de `process.env`, corre
  `SELECT COUNT(*) AS n FROM login WHERE tipo = 1`, devuelve el resultado como
  JSON y cierra la conexión.
- `vercel.json`: cron diario a las 5:00 sobre `/api/cron/sync`.
- `maxDuration` de 60 segundos en esa ruta.
- `.gitignore` con `.env*`.

**Checkpoint:** el usuario carga las variables en Vercel y hace un `curl` con
el `CRON_SECRET`. Tiene que devolver un número.

---

## Fase 1 — Queries de MySQL

Consultas en `lib/queries/`, una por métrica, parametrizadas por mes y país.
Cada archivo con comentarios que expliquen las decisiones.

1. Registros
2. Pacientes nuevos (primera sesión realizada en el mes)
3. Pacientes activos
4. Conversión por cohorte de registro
5. Mediana y p80 de días entre registro y primera sesión
6. Registros por plataforma, aplicando el mapeo de UTMs de `METRICAS.md` §7
7. Margen USD por paciente y LTV por cohorte

Antes de escribirlas, **listar todas las ambigüedades encontradas y esperar
respuesta**. No resolver ninguna por cuenta propia.

Agregar en MySQL y devolver el resultado ya reducido — el job tiene 60
segundos.

**Checkpoint:** el usuario corre las queries y compara los números contra
Looker Studio. Este es el checkpoint más importante del proyecto. No avanzar
si no cuadran.

---

## Fase 2 — Schema en Supabase

Migraciones versionadas en `supabase/migrations/`, schema `marketing`:

- `parametros` — ver `METRICAS.md` §3
- `utm_mapping` — ver §7
- `gastos` — mes, país, canal, monto USD, carga manual
- `metricas_mensuales` — ver §8
- `sync_log` — timestamp, filas procesadas, error

Aplicar con el CLI de Supabase, nunca a mano en el editor web.

**Checkpoint:** las tablas existen y el usuario cargó los parámetros iniciales
(`pct_comision` AR 0,26 / UY 0,30).

---

## Fase 3 — Job de sincronización

Completar el route handler de la fase 0 con la lógica real.

- Lee de MySQL con las queries de la fase 1
- Aplica las fórmulas de `lib/metrics`
- Upsert idempotente en `metricas_mensuales`
- Escribe en `sync_log` en cada corrida, con éxito o error
- Solo mes en curso y anterior
- Todo dentro de una transacción

**Checkpoint:** el usuario dispara el job a mano y verifica que las filas en
Supabase coincidan con las queries de la fase 1.

---

## Fase 4 — Pestaña Admin

Va antes que General: sin parámetros cargados, las métricas no tienen de dónde
salir.

- Carga de gasto mensual por país y canal, en USD
- Parámetros vigentes, con botón **"Nueva vigencia"** — nunca "Editar". Cambiar
  un valor inserta una fila nueva; el histórico no se toca.
- Tabla de mapeo de UTMs, editable
- Alerta cuando aparece un `utm_source` sin mapear con volumen relevante
- Alerta cuando falta un parámetro para cerrar el mes
- Historial de cambios: qué cambió, de qué a qué, desde cuándo, cuándo se cargó

**Checkpoint:** el usuario carga un mes de gasto y verifica que aparezca en el
historial.

---

## Fase 5 — Pestaña General

Selector de país (AR / UY / Total, nunca Total por default), selector de mes,
última sincronización en el header.

**Fila de volumen:** Registros · Pacientes nuevos · Pacientes activos ·
Conversión · Mediana de compra (con p80 al lado). Cada una con delta contra el
mes anterior.

**Fila de economía:** Gasto USD · CAC · LTV · LTV/CAC · Churn.

**Gráfico:** registros por fuente, últimos 3 meses, barras apiladas por
plataforma. Debajo, lista por fuente con volumen, participación y delta. "Sin
utm" es una fila fija y visible, no un resto escondido.

Meses en curso atenuados y sin delta. Cohortes proyectadas marcadas como
proyectadas.

**Checkpoint:** los números de General coinciden con los de Looker para un mes
cerrado.

---

## Fase 6 — Ads y Funnel

A definir con el usuario cuando General esté andando. No empezar sin
especificación.

Ads: tabla de campañas con semáforo de tres estados (sin veredicto / ok / red
flag), umbrales de `METRICAS.md` §5.

Funnel: embudo hasta la segunda sesión, y aparte curva de permanencia por
cohorte. Son dos objetos distintos — después de la segunda sesión ya no hay
etapas, hay permanencia. Segmentable por canal.
