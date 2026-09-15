# CLAUDE.md

Dashboard de marketing de Tu Terapia. Reemplaza el reporting que hoy vive en
Looker Studio.

**Antes de escribir cualquier código, leé `METRICAS.md`.** Es la fuente de
verdad de todas las definiciones de métricas. No inventes definiciones ni
supongas reglas de negocio que no estén ahí.

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
   │  job nocturno, agrega en SQL
   ▼
Railway  ·  servicio sync-marketing  ·  TypeScript  ·  IP estática
   │  upsert idempotente
   ▼
Supabase  ·  schema marketing  ·  tablas de agregados
   │
   ▼
Next.js en Vercel  ·  App Router  ·  Server Components
```

El dashboard **nunca** consulta MySQL en vivo. Lee solo de Supabase.

## Stack

| Capa | Herramienta |
|---|---|
| Ingesta | Railway, TypeScript, `mysql2` |
| Almacenamiento | Supabase (Postgres), schema `marketing` |
| App | Next.js App Router en Vercel |
| Auth | Supabase Auth, restringido al dominio de la empresa |
| Gráficos | Tremor (copy-paste en el repo, Tailwind v4) |
| Tablas | TanStack Table |
| Migraciones | Supabase CLI, versionadas en el repo |

No agregar dependencias sin preguntar. El stack es chico a propósito: lo
mantiene una sola persona.

## Estructura

```
/METRICAS.md          definiciones — fuente de verdad
/apps/web             Next.js
/apps/sync            job de sincronización (Railway)
/packages/metrics     tipos y fórmulas compartidas
/supabase/migrations  migraciones versionadas
```

Las fórmulas de `METRICAS.md` §4 viven en `packages/metrics` y las consumen
tanto el job como la web. **Nunca duplicar un cálculo entre las dos.**

---

## Reglas no negociables

**Datos**
- MySQL es de solo lectura. Ninguna escritura, nunca.
- Nunca leer columnas con datos personales (`nombre`, `apellido`, `telefono`,
  `email`, `fecha_nacimiento`). El dashboard es agregado: no necesita
  identificar a nadie.
- Agregar del lado de MySQL y traer el resultado ya reducido. No traer filas
  crudas para agregar en memoria.
- Sincronización incremental por fecha, no tabla completa.

**Job**
- Upsert idempotente sobre la clave primaria. Nunca `insert`.
- Escribe solo el mes en curso y el anterior. Nunca recalcula meses cerrados.
- Cada corrida escribe en `marketing.sync_log` (timestamp, filas, error).
- Toda la escritura de un mes dentro de una transacción.

**Credenciales**
- Solo en variables de entorno. Nunca en el repo, nunca en un `.env`
  commiteado. `.gitignore` con `.env` desde el primer commit.

**UI**
- Los meses provisorios se marcan visualmente y no llevan delta.
- Las cohortes proyectadas se marcan como proyectadas, con su edad al lado.
- El header muestra siempre la última sincronización.
- Si un número aparece en dos pestañas, sale de la misma tabla de agregados.
  Nunca se recalcula por separado.

**Idioma**
- UI en español. Código, nombres de variables y commits en inglés.

---

## Orden de construcción

1. Queries de MySQL contra las definiciones de `METRICAS.md` — **y parar acá**
   para validar los números contra Looker
2. Migraciones del schema `marketing`
3. Job de sincronización
4. Pestaña Admin (parámetros, gasto, mapeo de UTMs)
5. Pestaña General
6. Ads y Funnel

No avanzar al paso siguiente sin que el anterior esté validado. Un error en
las queries se hereda hacia arriba y se descubre semanas después.
