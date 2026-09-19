# CLAUDE.md

Dashboard de marketing de Tu Terapia. Reemplaza el reporting que hoy vive en
Looker Studio.

**Antes de escribir cualquier código, leé `METRICAS.md` y `BUILD.md`.**
`METRICAS.md` es la fuente de verdad de todas las definiciones de métricas.
`BUILD.md` es el plan de construcción por fases.
`INSIGHTS.md` describe la pestaña de análisis — incluido el hecho de que su
generador **no vive en este repositorio**.

---

## Regla principal

**Ante cualquier ambigüedad, preguntá. No decidas.**

Qué cuenta como sesión válida, cómo tratar un paciente sin país, qué hacer con
un pago huérfano, cómo redondear un porcentaje: todas esas son decisiones de
negocio, no técnicas. Un supuesto razonable metido en silencio es peor que una
pregunta, porque el error queda enterrado en un número que parece correcto.

Si `METRICAS.md` no lo cubre, preguntá y después lo agregamos al documento.

---

## Arquitectura

```
MySQL (tuterapiaweb, solo lectura)
   │  Vercel Cron, nocturno, agrega en SQL
   ▼
/app/api/cron/sync  ·  route handler
   │  upsert idempotente
   ▼
Supabase  ·  schema marketing  ·  tablas de agregados
   │
   ▼
Next.js en Vercel  ·  App Router  ·  Server Components
```

Todo vive en un solo proyecto Next.js. El job de sincronización es un route
handler disparado por Vercel Cron, no un servicio aparte.

El dashboard **nunca** consulta MySQL en vivo. Lee solo de Supabase.

## Stack

| Capa | Herramienta |
|---|---|
| App y job | Next.js App Router en Vercel |
| Cron | Vercel Cron (`vercel.json`) |
| Lectura | `mysql2/promise` |
| Almacenamiento | Supabase (Postgres), schema `marketing` |
| Auth | Supabase Auth, restringido al dominio de la empresa |
| Gráficos | Tremor (copy-paste en el repo, Tailwind v4) |
| Tablas | TanStack Table |
| Migraciones | Supabase CLI, versionadas en el repo |

No agregar dependencias sin preguntar. El stack es chico a propósito: lo
mantiene una sola persona.

## Estructura

```
/METRICAS.md              definiciones — fuente de verdad
/BUILD.md                 plan por fases
/INSIGHTS.md              pestaña de análisis — el generador está afuera
/app                      Next.js App Router
  /api/cron/sync          job de sincronización
/lib/metrics              fórmulas compartidas
/lib/queries              consultas SQL a MySQL
/supabase/migrations      migraciones versionadas
```

Las fórmulas de `METRICAS.md` §4 viven en `lib/metrics` y las consumen tanto el
job como la web. **Nunca duplicar un cálculo entre las dos.**

---

## Reglas no negociables

**Datos**
- MySQL es de solo lectura. Ninguna escritura, nunca.
- Las pantallas y los agregados son anónimos. Ninguna tabla de Supabase guarda
  `nombre`, `apellido`, `telefono`, `email` ni `fecha_nacimiento`, y ninguna
  query del job los lee. El dashboard no necesita identificar a nadie.
- **Única excepción: la exportación de caída por cohorte**
  (`/api/funnel/csv?cohorte=YYYY-MM&tramo=N`), pedida explícitamente por el
  dueño del producto el 2026-09-16 y ampliada a la grilla el 2026-09-18. Lee
  `nombre` y `email` de MySQL **en el momento de la descarga** y no los
  persiste: no pasan por Supabase, no quedan en un agregado, no los toca el
  cron. Si hiciera falta otro dato personal, se agrega acá o no se agrega.
- Exporta exactamente cinco columnas y ninguna más: `email`, `nombre`,
  `fecha_registro`, `pais`, `utm_source`. La primera línea del archivo es un
  aviso de que son datos de pacientes en tratamiento y su distribución está
  restringida.
- Tres condiciones, las tres obligatorias, porque la grilla dejó la descarga a
  un clic de distancia y eso la volvió fácil de hacer sin pensarla:
  1. sesión válida (la cubre el middleware);
  2. `export_pii = true` en `marketing.permisos`, que es un permiso distinto
     del de leer el dashboard — sin él la celda muestra el número y no baja
     nada;
  3. una fila en `marketing.export_log` **antes** de mandar el archivo. Si esa
     escritura falla, la descarga no sale.
- Esa ruta es la única que consulta MySQL en vivo. Guardar los datos personales
  en Supabase sería peor: dejaría una segunda copia permanente de un padrón de
  pacientes en tratamiento, sincronizada todas las noches.
- **Quién entra**: Supabase Auth, una cuenta por persona, restringido a
  `@tuterapia.com.uy`. Se verifica en el login —así una cuenta de afuera no
  llega a tener sesión— y de nuevo en el middleware en cada request.
- Esto reemplazó a la contraseña compartida, que era el riesgo abierto de este
  documento: cualquiera que la tuviera podía bajar el padrón completo y no
  quedaba registro de quién lo había hecho. Ahora cada descarga nominal se
  firma con un mail.
- **Riesgo abierto, sin resolver**: las cuatro cuentas se crearon el 2026-09-18
  con la misma contraseña, así que hasta que cada persona cambie la suya el
  registro dice de quién es la cuenta, no quién la usó.
- Agregar del lado de MySQL y traer el resultado ya reducido. No traer filas
  crudas para agregar en memoria. El job tiene 60 segundos.
- Sincronización incremental por fecha, no tabla completa.

**Job**
- Valida `Authorization: Bearer ${process.env.CRON_SECRET}` y devuelve 401 si
  no coincide. La URL es pública.
- Upsert idempotente sobre la clave primaria. Nunca `insert`.
- Escribe solo el mes en curso y el anterior. Nunca recalcula meses cerrados.
- Cada corrida escribe en `marketing.sync_log` (timestamp, filas, error).
- Toda la escritura de un mes dentro de una transacción.

**Credenciales**
- Solo en variables de entorno. Nunca en el repo, nunca en un `.env`
  commiteado. `.gitignore` con `.env*` desde el primer commit.
- Si necesitás un valor de credencial, pedile al usuario que lo cargue en
  Vercel. Nunca le pidas que lo pegue en el chat.

**UI**
- Los meses provisorios se marcan visualmente y no llevan delta.
- Las cohortes proyectadas se marcan como proyectadas, con su edad al lado.
- El header muestra siempre la última sincronización.
- Si un número aparece en dos pestañas, sale de la misma tabla de agregados.
  Nunca se recalcula por separado.

**Idioma**
- UI en español. Código, nombres de variables y commits en inglés.
