# METRICAS.md — Dashboard de marketing

Documento de definiciones. Es la fuente de verdad de cómo se calcula cada
número del dashboard. Si una métrica aparece en dos pestañas, sale de la
misma tabla de agregados — nunca se recalcula por separado.

---

## 1. Fuentes

Base MySQL de solo lectura: `tuterapiaweb`, usuario dedicado con `SELECT`.

| Tabla | Qué aporta | Join |
|---|---|---|
| `login` | Cuenta, UTMs, país, fecha de alta | `id` |
| `pacientes` | Perfil del paciente | `id_login` (PK) → `login.id` |
| `sesiones` | Sesiones agendadas y realizadas | `id_paciente` → `pacientes.id_login` |
| `pacientes_pagos` | Paquetes comprados | `id_paciente` → `pacientes.id_login` |

### Reglas de lectura

- **Registro** = fila en `login` con `tipo = 1`. `tipo = 2` son terapeutas y
  se excluyen siempre.
- **Fecha de registro** = `login.creacion`. Es el momento en que se crea la
  cuenta y el único atado a los UTMs.
- **Sesión efectiva** = `sesiones.realizada = 1`.
- **Venta** = `pacientes_pagos.confirmado = 1`. Lo no confirmado es intento
  de pago, no venta.
- **Fecha de pago** = `pacientes_pagos.creacion`. **No usar `fecha`**: es un
  valor calculado a futuro (vencimiento del paquete), idéntico entre filas.
- **País** = `login.paisDominio`. `paisIp` solo para análisis de tráfico.
- **Chile** (`CL`) se excluye de todo el dashboard.

---

## 2. Monedas

`moneda` tiene dos valores (`$`, `U$S`) pero **tres monedas reales**. El `$`
es peso argentino o uruguayo según el país.

| paisDominio | moneda | Moneda real | Promedio observado |
|---|---|---|---|
| AR | `$` | ARS | 26.930 |
| UY | `$` | UYU | 2.290 |
| AR / UY | `U$S` | USD | 60–76 |

**Regla: la conversión cruza `moneda` × `paisDominio`, nunca `moneda` sola.**
Convertir por `moneda` solamente trata montos uruguayos con tipo de cambio
argentino; el error es de un factor cercano a 12.

Los pagos en `U$S` se toman directo, sin convertir.

El tipo de cambio de un mes pasado **no se actualiza nunca**. Un pago de marzo
se convierte al dólar de marzo y ese valor queda fijo. La vigencia existe
justamente para eso.

---

## 3. Parámetros

Viven en `marketing.parametros`, con vigencia. **Cambiar un valor inserta una
fila nueva; nunca se pisa la anterior.** El job busca el valor vigente a la
fecha del pago, no el de hoy.

```sql
create table marketing.parametros (
  clave         text    not null,   -- 'pct_comision' | 'tipo_cambio'
  pais          text    not null,   -- 'AR' | 'UY'
  valor         numeric not null,
  vigente_desde date    not null,
  primary key (clave, pais, vigente_desde)
);
```

| Parámetro | AR | UY | Cadencia |
|---|---|---|---|
| `pct_comision` | 0,26 | 0,30 | Casi nunca cambia |
| `tipo_cambio` | ARS/USD | UYU/USD | Mensual, carga manual |

El porcentaje es **revenue final**: ya está neto de pasarela y de todo lo
demás. No se le resta nada más.

El tipo de cambio a cargar es **aquel al que se convierte o gira realmente**,
no el oficial.

El precio de sesión **no es parámetro** — se deriva de la base. Todo lo que se
pueda calcular de los datos no se configura.

---

## 4. Fórmulas

### Margen

```
precio_sesion_local = pacientes_pagos.monto / pacientes_pagos.sesiones
margen_usd_sesion   = precio_sesion_local × pct_comision[pais] / tipo_cambio[pais, mes]
```

Para pagos en `U$S` se omite la división por tipo de cambio.

### LTV

```
LTV_usd = sesiones_realizadas_por_paciente × margen_usd_sesion
```

Sobre **sesiones realizadas**, no compradas. El saldo sin usar
(`sesiones - usadas`) es pasivo, no ganancia, y es justamente lo que deja el
que abandona.

Solo sobre **cohortes cerradas** (90 días). Los pacientes activos todavía no
terminaron su ciclo; incluirlos subestima el LTV.

### CAC

```
CAC_usd = gasto_usd[mes, pais, canal] / pacientes_nuevos[cohorte de registro de ese mes]
```

El denominador son **activados, no registros**. El gasto se carga manual en
USD, ya dolarizado — ese lado no necesita conversión. Solo entra gasto de
canales pagos.

### LTV / CAC

Ambos en USD y sobre margen, nunca sobre facturación.
**Objetivo: a definir.** El 3,0 habitual viene de SaaS y no necesariamente
aplica a un marketplace de sesiones con ciclo corto.

---

## 5. Ventanas de madurez

Distribución medida de días entre registro y primera sesión realizada
(muestra: 7.473 conversiones desde enero 2025):

| Percentil | Días |
|---|---|
| Mediana | 5 |
| p80 | 14 |
| p85 | 21 |
| p90 | 34 |
| p95 | 83 |

| Uso | Ventana | Captura |
|---|---|---|
| Semáforo de campañas | 14 días | 80% |
| Conversión por cohorte | 30 días | 89% |
| LTV cohorte cerrada | 90 días | 95% |

**Proyección de cohortes inmaduras.** Como la curva es conocida, una cohorte
joven se proyecta dividiendo lo observado por el porcentaje acumulado de su
edad (una cohorte de 7 días tiene el 64,5% de sus conversiones adentro →
observado ÷ 0,645). Se muestra marcada como proyectada, con la edad real al
lado.

Hay cola hasta 577 días; un 6% convierte después de los 60. Eso nunca se
captura en vivo, lo que significa que el CAC real es levemente **mejor** que
el que muestra el tablero, no peor.

---

## 6. Métricas del tablero

| Métrica | Definición | Regla |
|---|---|---|
| Registros | `login` con `tipo = 1`, por mes de `creacion` | — |
| Pacientes nuevos | Pacientes con su **primera sesión realizada** en el mes | Se asignan al mes de la sesión |
| Pacientes activos | Con ≥1 sesión realizada en el mes | — |
| Conversión | Nuevos ÷ registros **de la misma cohorte de registro** | Proyectada si < 30 días |
| Mediana de compra | Días entre registro y primera sesión, con p80 al lado | Disponible desde el día uno |
| Churn | Activos del mes N sin sesión en los 60 días siguientes | Se conoce con 2 meses de retraso |
| Gasto USD | Carga manual en Admin | — |
| CAC / LTV / LTV-CAC | Ver §4 | Solo margen |

### Reglas transversales

- **Todo separado AR / UY.** Activación ~8–9% contra ~16–17%, duraciones y
  monedas distintas. El "Total" es una tercera opción, nunca el default.
- **Meses en curso se marcan `es_provisorio`** y no llevan delta. Comparar un
  mes a medio andar contra uno completo pinta todo en rojo.
- **El job nunca recalcula meses cerrados.** Escribe solo el mes en curso y el
  anterior. Recalcular hacia atrás es un comando explícito, no un efecto del
  cron.
- **Pagos con `monto = 0`** (promos, cortesías) cuentan en volumen y se
  excluyen del ARPU y del LTV.

---

## 7. UTMs

Columnas en `login`: `utm_source`, `utm_campaign`, `utm_content`.
**No hay `utm_medium`.** `utm_campaign` suele repetir el valor de
`utm_source`.

`utm_source` no es una fuente: es un código con plataforma y país adentro
(`metaars`, `metauyj5`, `tkarg`, `instacl`). Se resuelve con una tabla de
mapeo editable en Admin.

```sql
create table marketing.utm_mapping (
  patron     text primary key,   -- 'meta%', 'tk%', 'google_ads'
  plataforma text not null,
  superficie text,               -- 'ads' | 'historias' | 'perfil' | 'organico'
  es_pago    boolean not null
);
```

| Patrón | Plataforma | Superficie | Pago |
|---|---|---|---|
| `meta%` | Meta | Ads | sí |
| `tk%`, `tiktok` | TikTok | Ads | sí |
| `google_ads`, `gads%` | Google Ads | Ads | sí |
| `heylink.me` | Instagram | Historias | no |
| `ig`, `insta%` | Instagram | Perfil | no |
| `blog` | Blog | Orgánico | no |
| `chatgpt.com` | ChatGPT | Referral | no |
| `null` / `''` | Sin utm | — | no |

- **`es_pago` es crítico.** Instagram orgánico (`heylink.me`, `ig`) y Meta
  pago (`meta%`) comparten plataforma pero no gasto. Si se mezclan, el CAC
  sale artificialmente barato porque atribuye registros gratis al gasto de
  ads. **Solo `es_pago = true` entra en el denominador del CAC.**
- **General** agrupa por plataforma. **Ads** muestra el `utm_source` completo.
- Admin alerta cuando aparece un `utm_source` sin mapear con volumen
  relevante. El mapeo se mantiene al día solo.
- El país no se parsea del source: sale de `paisDominio`. Cruzarlos sirve de
  control — `metaar` con `paisDominio = UY` es un error de etiquetado.
- **"Sin utm" es una fila fija y visible**, no un resto escondido. Se mueve
  entre 30% y 45% desde enero 2025 de forma estable: es tráfico directo real,
  no tracking roto. Un salto brusco significa que algo se rompió.

Hay **21 meses de tracking consistente**, así que el LTV por canal y cohorte
está disponible desde el inicio.

---

## 8. Tabla de agregados

```sql
create table marketing.metricas_mensuales (
  mes                 date    not null,
  pais                text    not null,
  plataforma          text,              -- null = todas
  registros           int,
  pacientes_nuevos    int,
  pacientes_activos   int,
  conversion_cohorte  numeric,
  conversion_proyectada boolean,
  mediana_dias_compra numeric,
  p80_dias_compra     numeric,
  gasto_usd           numeric,
  cac_usd             numeric,
  margen_usd          numeric,
  ltv_usd             numeric,
  churn_rate          numeric,
  es_provisorio       boolean not null,
  actualizado_en      timestamptz not null,
  primary key (mes, pais, plataforma)
);
```

Upsert idempotente sobre la clave primaria. Nunca `insert` — el job puede
correr dos veces.

Cada corrida escribe también en `marketing.sync_log` (timestamp, filas,
error). El dashboard muestra la última sincronización en el header. Sin eso,
un cron caído pasa desapercibido durante semanas.

---

## 9. Pendientes

- [ ] Verificar que `precio_sesion × pct` se acerque a los 6 y 10 USD
      estimados; si no, el estimado estaba viejo y manda la fórmula
- [ ] Sesiones promedio por paciente **sobre cohorte cerrada**, no sobre toda
      la base (el estimado de 9 y 13 puede estar inflado si excluye a los que
      hicieron una sola sesión)
- [ ] Contenido de `utm_content` — si trae la creatividad, sirve para Ads
- [ ] Objetivo de LTV/CAC propio
- [ ] `pacientes_pagos.tipo` y `tipo_session` (online/presencial): confirmar
      si afectan el margen o sirven para segmentar
