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

`pct_comision` es lo que la sesión **paga**, no lo que deja: el margen es el
complemento, `1 − pct_comision`. Multiplicar por la comisión en vez de por su
complemento dejaba el LTV en un tercio de lo que es (AR US$ 20 en vez de
US$ 61, UY US$ 49 en vez de US$ 114).
| `tipo_cambio` | ARS/USD | UYU/USD | Mensual, carga manual |

El porcentaje es **revenue final**: ya está neto de pasarela y de todo lo
demás. No se le resta nada más.

El tipo de cambio a cargar es **aquel al que se convierte o gira realmente**,
no el oficial.

El precio de sesión **no es parámetro** — se deriva de la base como
`monto / sesiones`. Todo lo que se pueda calcular de los datos no se
configura.

### `tipo_session` es una dimensión del precio

`pacientes_pagos.tipo_session` (`online` | `presencial`) cambia el precio y por
lo tanto el margen: no son el mismo producto. Cualquier precio promedio que no
separe por `tipo_session` mezcla dos poblaciones y se mueve solo cuando cambia
la proporción entre ellas, sin que haya cambiado ningún precio.

La columna es nullable, así que hay una tercera categoría de hecho: los pagos
sin dato.

Medido sobre los últimos 6 meses:

| País | Tipo | Precio por sesión | Máximo |
|---|---|---|---|
| AR | online | 32.498 | 36.000 |
| AR | presencial | 37.258 | 42.000 |
| UY | online | 1.418 | 1.600 |
| UY | presencial | 1.514 | 1.850 |

**Los precios de Argentina suben todos los meses** por inflación: el máximo
observado fue 31.000 en abril y 36.000 en septiembre. El promedio de una
ventana larga siempre queda por debajo del precio vigente, y por eso el job
calcula el margen con los pagos **del propio mes**, nunca con un promedio
arrastrado.

En Uruguay el precio no se movió en todo el año y el máximo observado coincide
exactamente con el precio de lista.

**El promedio está por debajo del precio de lista porque hay descuentos.** En
Uruguay el mínimo observado es 608 contra 1.600 de lista. El margen se calcula
sobre lo que se cobró de verdad, no sobre la lista: un paciente que entró con
cupón deja menos margen, y el tablero tiene que mostrar eso.

**El peso de la mezcla es distinto en cada país.** En Argentina presencial es
el 5% de las sesiones, así que el promedio ponderado es prácticamente el
precio online. En Uruguay están casi 50/50 y difieren 7%, así que un margen
que no separe por `tipo_session` se mueve cuando cambia la mezcla aunque
ningún precio haya cambiado.

---

## 4. Fórmulas

### Margen

```
precio_sesion_local = pacientes_pagos.monto / pacientes_pagos.sesiones
margen_usd_sesion   = precio_sesion_local × (1 − pct_comision[pais]) / tipo_cambio[pais, mes]
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
| Mediana de compra | Días entre registro y **primer pago confirmado**, dentro de los 30 días, con p80 al lado | Solo cohortes de 30 días o más |
| Churn | Activos del mes N−1 sin sesión en el mes N | Se guarda en la fila del mes N |
| Gasto USD | Carga manual en Admin | — |
| CAC / LTV / LTV-CAC | Ver §4 | Solo margen |

### Criterios de mes: no son el mismo

Tres métricas de la misma fila se agrupan por criterios distintos, y es a
propósito:

| Métrica | Se agrupa por |
|---|---|
| Registros | Mes de `login.creacion` |
| Pacientes nuevos | **Mes del primer pago confirmado** |
| Conversión y mediana de compra | **Mes de registro de la cohorte** |
| Pacientes activos | Mes de la sesión realizada |

Un paciente que se registró en marzo y compró en mayo suma a los registros de
marzo, a los pacientes nuevos de mayo, y a la conversión y la mediana de la
cohorte de marzo. Leer la fila de mayo como si todo hablara de mayo es el
error más fácil de cometer con esta tabla.

### Reglas transversales

- **Todo separado AR / UY.** Activación ~8–9% contra ~16–17%, duraciones y
  monedas distintas.
- **El selector arranca en Total** y recuerda la última elección. Con Total
  seleccionado, **el bloque de Volumen suma los dos países**, pero **el de
  Economía muestra AR y UY lado a lado, nunca un promedio**: comisión,
  duración y LTV son muy distintos entre los dos mercados, así que un CAC o un
  LTV promediado se mueve solo con el mix de gasto sin que nada haya cambiado.
- **Meses en curso se marcan `es_provisorio`** y comparan contra **el mismo
  tramo del mes anterior**: los primeros N días contra los primeros N días,
  con N igual a lo transcurrido. Comparar un mes a medio andar contra uno
  completo pinta todo en rojo sin motivo. El tramo lo mide y lo guarda el job,
  no la UI.
- **El tramo solo aplica a los conteos que son suma del mes** (registros y
  pacientes nuevos). Pacientes activos queda afuera aunque la columna exista:
  es un conteo distinto sobre una ventana, así que los primeros 15 días no
  traen la mitad de los activos y el delta leería como una caída inventada.
  Conversión y mediana de compra siguen sin delta
  en un mes en curso: son tasas sobre una cohorte joven, ya vienen proyectadas
  y superponerles una comparación esconde eso.
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
- **La mediana de compra usa la misma ventana de 30 días que la conversión**, y
  solo se muestra cuando la cohorte cumplió esos 30 días. Sin el tope, una
  cohorte reciente solo puede contener a los que pagaron rápido y su mediana
  queda artificialmente por debajo de una cohorte vieja.
- **Los días se cuentan en días calendario locales (UTC−3)**, no en UTC. Quien
  se registra a las 20:00 y paga a las 22:00 cruza la medianoche UTC y
  contaría como un día. Con una mediana de 0 y un p80 de 3, ese ruido es la
  mayor parte de la señal.
- **Activados** — pacientes con su **primera sesión realizada** en el mes — se
  guarda pero **no se muestra en General**. La brecha contra pacientes nuevos
  es la tasa de no-show y pertenece a Funnel.
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

## 7 bis. Grano diario

`marketing.metricas_diarias` guarda fecha, país y plataforma, con registros,
pacientes nuevos y conversión. Nada más: margen, churn y LTV no significan
nada en un día suelto.

- El job la escribe en cada corrida sobre los **últimos 45 días**, no solo
  sobre los días nuevos. Un pago tardío mueve la conversión de un día de hasta
  30 días atrás, y una ventana más corta dejaría esos días congelados.
- **El día es el día local (UTC−3).** En días UTC la noche de un día cae en el
  siguiente y se borronea el patrón de fin de semana, que es justamente lo que
  la pantalla mira.
- La conversión diaria usa la misma ventana de 30 días y la misma curva de
  madurez que la mensual. Casi todos los días de la ventana son cohortes de
  menos de 30 días, así que vienen proyectados y se marcan como tales.
- Las filas por plataforma llevan **solo volumen**: una conversión partida por
  plataforma en un día suelto se apoya en un puñado de registros.

## 7 ter. Tendencia y lectura automática

La tendencia de cada card no es el delta contra el mes anterior: es la
**pendiente por mínimos cuadrados sobre los últimos 6 meses cerrados**. Una
pendiente aguanta el mes raro que una comparación punta a punta leería como
cambio de rumbo.

El cambio se expresa como el movimiento a lo largo de toda la ventana:

| Tipo de métrica | Unidad | Umbral de "estable" |
|---|---|---|
| Tasas (conversión) | puntos porcentuales | menos de 1 pp |
| Conteos y dinero | porcentaje relativo | menos de 5% |

Hacen falta **al menos 3 meses con dato**; con menos, la card dice "sin datos
suficientes" en vez de inventar una dirección.

### Reglas de la lectura automática

Se evalúan en orden y gana la primera que se cumple, así que las más
específicas van primero. Cada una es una afirmación sobre dos pendientes.

| # | Condición | Qué dice |
|---|---|---|
| 1 | LTV / CAC < 1 | Cada paciente cuesta más de lo que deja |
| 2 | CAC sube y costo por registro no sube | El tráfico no se encareció, se convierte peor: el problema está en el funnel |
| 3 | CAC sube y costo por registro sube | Se encareció el tráfico: es precio de medios, no conversión |
| 4 | CAC baja y costo por registro no baja | Se convierte mejor con el mismo tráfico |
| 5 | Conversión baja y registros suben | Entra más gente y convierte peor |
| 6 | Conversión sube y registros bajan | Entra menos gente pero más calificada |
| 7 | Registros bajan y conversión estable | El problema está antes del registro |
| 8 | Activos bajan y nuevos no bajan | Se está yendo gente por el otro lado |
| 9 | Conversión, registros y nuevos estables | Sin movimientos relevantes |

Si ninguna se cumple, no se muestra ninguna frase. **El tablero no dice nada
antes que decir algo que no se sostiene.**

### El gasto se guarda por semana

`marketing.gastos` tiene grano **semanal**: `(semana, pais, canal)`. Es el
grano al que se planifica la pauta, y agregarlo a mes al importar tira el
detalle que Ads necesita para juzgar una campaña. Un mes se reconstruye
sumando semanas; al revés no.

- **Una semana pertenece al mes de su primer día**, nunca se parte entre dos.
  Las semanas arrancan los miércoles, así que muchas cruzan el borde del mes.
  Partirlas por días sería más preciso en abstracto y dejaría de coincidir con
  la planilla donde se planifica el gasto, que es contra lo que cualquiera va
  a chequear el número.
- **Los canales de la planilla se mapean a las plataformas de `utm_mapping`.**
  "Tik Tok" es TikTok y "Meta Sueños" es Meta; el nombre original queda en
  `canal_csv` para que Ads pueda separarlos.
- **Chile se descarta en la importación**, como en todo el resto.
- El importador es `scripts/importar-gastos.ts` y es idempotente: agrega por
  clave antes de escribir y hace upsert con el valor, no suma.

### Costo por registro

```
costo_por_registro_usd = gasto_usd[mes, pais] / registros[mes, pais]
```

Es el precio del tráfico antes de convertir. Leído junto al CAC separa las dos
razones por las que un CAC se mueve: cuánto cuesta traer a alguien, y qué
proporción de esos alguien compra.

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
- [x] `pacientes_pagos.tipo`: **no sirve para segmentar**. Vale 1 en los
      22.164 pagos confirmados de los últimos 6 meses, sin nulos.
- [x] `tipo_session`: **sí afecta el margen**, ver §3.
