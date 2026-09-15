# METRICAS.md — Dashboard de marketing

Documento de definiciones. Es la fuente de verdad de cómo se calcula cada
número del dashboard. Si una métrica aparece en dos pestañas, sale de la
misma tabla de agregados — nunca se recalcula por separado.

---

## 1. Fuentes

Base de solo lectura: `tuterapiaweb`, usuario dedicado con `SELECT`. El motor
es **MariaDB 10.6**, no MySQL — la sintaxis exclusiva de MySQL 8 no aplica.

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
  Verificado: el país del pago coincide con el del login salvo en 9 filas de
  117.712, así que el del login manda siempre.
- **Chile** (`CL`) se excluye de todo el dashboard.
- **Zona horaria.** La base guarda en UTC (`NOW()` = `UTC_TIMESTAMP()`), pero
  **los meses se cortan en hora local, UTC−3**. Un registro de las 21:30 del
  31 de agosto es de agosto, aunque en UTC figure como 1 de septiembre. El
  filtro se aplica como rango UTC corrido tres horas, no convirtiendo fila por
  fila, para no perder el índice.
- **`login.active` no filtra.** Los 127.381 registros con `tipo = 1` tienen
  `active = 1`; solo se desactivan terapeutas.
- **`pacientes.terminarRegistro` tampoco filtra, y marca al revés de lo que
  sugiere el nombre.** `= 1` es "le falta terminar" (37.900 registros, 27.203
  sin terapeuta) y `= 0` es registro completo (89.401, de los cuales 88.887
  con terapeuta). No es un motivo de exclusión: son registros igual, lo que no
  completaron es el funnel.
- **Para "tiene terapeuta" se usa `pacientes.id_terapeuta IS NOT NULL`, no el
  flag.** Los dos no coinciden: 10.697 pacientes tienen `terminarRegistro = 1`
  y terapeuta asignado igual. Con la columna: 99.584 con terapeuta, 27.717
  sin.

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

**Los dos factores se muestran por separado**, además del producto: cuántas
sesiones hace un paciente y cuántos dólares deja cada sesión. Un LTV que se
mueve no dice cuál de los dos se movió, y son palancas distintas.

Sobre **sesiones realizadas**, no compradas. El saldo sin usar
(`sesiones - usadas`) es pasivo, no ganancia, y es justamente lo que deja el
que abandona.

Solo sobre **cohortes cerradas** (90 días). Los pacientes activos todavía no
terminaron su ciclo; incluirlos subestima el LTV.

### CAC

```
CAC_usd = gasto_usd[mes, pais] / pacientes_nuevos[mes, pais]
```

Mes a mes, los dos lados sobre el mismo mes calendario. El denominador son
**activados, no registros**: pacientes con su primera sesión realizada en el
mes. El gasto se carga manual en USD, ya dolarizado — ese lado no necesita
conversión.

El gasto **no se atribuye hacia atrás** a la cohorte de registro, y el
denominador son **todos** los pacientes nuevos, no solo los que llegaron por
un `utm_source` pago. Es una simplificación deliberada: mezcla adquisición
orgánica con gasto pago, así que el CAC que muestra el tablero es más barato
que el CAC puro de los canales pagos.

### LTV / CAC

Ambos en USD y sobre margen, nunca sobre facturación.
**Objetivo: a definir.** El 3,0 habitual viene de SaaS y no necesariamente
aplica a un marketplace de sesiones con ciclo corto.

---

## 5. Ventanas de madurez

Distribución medida de días entre registro y primera sesión realizada
(muestra: 7.473 conversiones desde enero 2025):

**Ojo:** esta tabla mide registro → primera **sesión** realizada. Desde que
pacientes nuevos y conversión se miden sobre la **venta**, la curva que usa el
tablero para proyectar es la de registro → primer pago, que se calcula de los
datos en cada corrida y es bastante más empinada. Esta queda como referencia
del funnel, no como insumo de la proyección.

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
| Pacientes nuevos | Pacientes con su **primer pago confirmado** en el mes | Se asignan al mes de la venta |
| Pacientes activos | Con ≥1 sesión realizada en el mes | — |
| Conversión | Compradores ÷ registros **de la misma cohorte de registro**, ventana **fija de 30 días** | Proyectada si < 30 días |
| Mediana de compra | Días entre registro y **primer pago confirmado**, con p80 al lado | Disponible desde el día uno |
| Churn | Activos del mes N−1 sin sesión en el mes N | Se guarda en la fila del mes N |
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
  excluyen del ARPU y del LTV. Son 4.042 de 117.712 pagos confirmados.
- **La ventana de conversión es fija.** Se cuenta la primera sesión realizada
  dentro de los 30 días del registro y nada después. Un mes cerrado deja de
  moverse. La cola real (6% convierte pasados los 60 días) queda afuera, lo
  que subestima la conversión y encarece el CAC — el error va para el lado
  seguro.
- **El churn vive en la fila del mes en que se conoce.** El churn de los
  activos de N−1 se calcula con las sesiones de N y se guarda en N. Así entra
  en la ventana de escritura del job y no hace falta recalcular meses
  cerrados.
- **La venta es el hito, no la sesión.** Un paciente es nuevo cuando compra.
  Medido contra la primera sesión realizada el número da ~6% menos (576 contra
  613 en AR, agosto 2026): la diferencia son los que ya pagaron y todavía no
  se sentaron con nadie.
- **Conversión, pacientes nuevos y mediana de compra miden el mismo evento.**
  Los tres cuelgan del primer pago confirmado, así que la curva de madurez que
  proyecta cohortes inmaduras es la de registro → primer pago, no la de
  registro → primera sesión de §5. Es mucho más empinada: la mediana compra el
  mismo día que se registra y el p80 está en 3-6 días, así que una cohorte
  está prácticamente cerrada a las dos semanas.
- **Pacientes activos sigue midiendo sesiones**, no ventas: activo es el que
  se sienta, no el que pagó hace seis meses y tiene saldo.
- **El denominador del LTV son los compradores**, la misma población por la que
  divide el CAC. Si uno contara compradores y el otro pacientes con sesión, el
  cociente LTV/CAC compararía dos cosas distintas.

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
  ads. `es_pago` sigue siendo la base para separar tráfico pago de orgánico en
  Ads y en General. **No filtra el denominador del CAC**, que es el total de
  pacientes nuevos del mes — ver §4.
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

`plataforma` y `pais` **no admiten null**: Postgres no acepta nulos en una
clave primaria. El agregado de todas las plataformas se guarda con el literal
`'TODAS'` y el de todos los países con `'TOTAL'`. El job los calcula y los
escribe; la UI no los suma por su cuenta, porque una mediana o una conversión
no son sumables.

Upsert idempotente sobre la clave primaria. Nunca `insert` — el job puede
correr dos veces.

Cada corrida escribe también en `marketing.sync_log` (timestamp, filas,
error). El dashboard muestra la última sincronización en el header. Sin eso,
un cron caído pasa desapercibido durante semanas.

---

## 9. Pendientes

- [x] Verificar que `precio_sesion × pct` se acerque a los 6 y 10 USD
      estimados. **Cuadra.** Últimos 6 meses: AR 33.214 ARS por sesión × 0,26
      = 8.636 ARS, UY 1.468 UYU × 0,30 = 440 UYU. A un tipo de cambio cercano
      a 1.440 y 44 eso da 6 y 10 USD.
- [ ] **Pagos en `U$S` son otro precio, no el mismo convertido:** 43–44 USD
      por sesión contra ~23 USD equivalentes en moneda local. Confirmar si
      `pct_comision` aplica igual a esos pagos.
- [ ] **Definir de dónde sale el LTV.** Pendiente de definición del negocio.
- [ ] Sesiones promedio por paciente **sobre cohorte cerrada**, no sobre toda
      la base (el estimado de 9 y 13 puede estar inflado si excluye a los que
      hicieron una sola sesión)
- [ ] Contenido de `utm_content` — si trae la creatividad, sirve para Ads
- [ ] Objetivo de LTV/CAC propio
- [ ] `pacientes_pagos.tipo` y `tipo_session` (online/presencial): confirmar
      si afectan el margen o sirven para segmentar
