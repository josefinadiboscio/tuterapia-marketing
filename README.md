# Tu Terapia · Marketing

Dashboard de marketing. Reemplaza el reporting que hoy vive en Looker Studio.

Definiciones de métricas: [`METRICAS.md`](METRICAS.md) — fuente de verdad.
Plan por fases: [`BUILD.md`](BUILD.md). Convenciones: [`CLAUDE.md`](CLAUDE.md).

## Arquitectura

Un solo proyecto Next.js en Vercel. El job de sincronización es un route
handler disparado por Vercel Cron, no un servicio aparte. El dashboard nunca
consulta MySQL en vivo: lee de Supabase.

```
MySQL (tuterapiaweb, solo lectura)
   │  Vercel Cron, diario
   ▼
/app/api/cron/sync
   │  upsert idempotente
   ▼
Supabase · schema marketing
   ▼
Next.js App Router
```

## Variables de entorno

Se cargan en Vercel (Settings → Environment Variables). Nunca en el repo.
La lista está en [`.env.example`](.env.example).

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

## Endpoints

| Ruta | Qué hace |
|---|---|
| `/api/cron/sync` | Job de sincronización. Requiere `Authorization: Bearer $CRON_SECRET` |
| `/api/cron/schema` | Temporal: columnas de las tablas fuente |
| `/api/cron/profile` | Temporal: perfilado de datos para la fase 1 |

Los dos temporales, junto con el workflow `probe.yml`, se borran cuando las
queries estén validadas contra Looker.

## Probar los endpoints sin terminal

Actions → **Probe cron endpoints** → Run workflow. El token sale del secreto
`CRON_SECRET` del repositorio y GitHub lo enmascara en el log.

## Deploys

Vercel despliega `main` en cada push. En plan Hobby **solo despliega commits
cuyo autor sea el dueño del proyecto** (`nbrupbacher@tuterapia.com.uy`): un
commit con otro autor queda como *Deployment Blocked*.
