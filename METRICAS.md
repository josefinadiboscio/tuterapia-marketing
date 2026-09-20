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

`pct_comision` es **lo que Tu Terapia se queda**, no lo que paga. Una sesión
argentina son ~36.000 ARS; a 1550 son US$ 23,23, y el 26% de eso son los
**US$ 6** que deja. El 74% restante es del terapeuta.

Estuvo invertida unas horas, con la teoría de que un LTV de US$ 20 era muy
bajo. No era el margen: US$ 20 es lo que vale una cohorte en sus primeros 90
días, y el número contra el que se lo comparaba era el de por vida.

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

### Dos "sesiones por paciente", que miden cosas distintas

| | `sesiones_por_paciente` | `sesiones_historico` |
|---|---|---|
| Qué cuenta | La cohorte de registro, en sus primeros **90 días** | **Toda la vida** del paciente, base entera |
| Denominador | Compradores de esa cohorte | Todos los que hicieron ≥1 sesión |
| AR · UY | 3,77 · 4,46 | **8,68 · 13,63** |
| Para qué | Es el multiplicador del LTV | Es la respuesta a "cuántas sesiones hace un paciente" |
| LTV que implica | AR US$ 21,6 · UY US$ 49,0 | AR US$ 49,8 · UY US$ 149,7 |

El primero **tiene** que estar acotado: sin ventana, una cohorte vieja siempre
parece mejor solo por haber tenido más tiempo, y dejaría de ser comparable
entre meses. El segundo **tiene** que derivar: es la antigüedad de la base y se
mueve de a décimas por mes.

En la card del LTV va el segundo, **sin `×` adelante**, porque no multiplica al
número de arriba: el LTV se calcula con el primero.

Si sumamos solo a los que además tienen un pago confirmado, el histórico da
9,06 en AR y 14,33 en UY. Se eligió el denominador ancho: una sesión de promo
o cortesía sigue siendo una sesión que el paciente hizo.

**Decidido el 2026-09-17: Ads usa el LTV de por vida que maneja el negocio,
US$ 60 en AR y US$ 120 en UY.** Es un valor declarado, no derivado: vive en
`lib/umbrales.ts` (`LTV_USD`) y se cambia ahí. La medición da cerca —AR US$
49,8 de por vida con el margen correcto— y la diferencia es el redondeo con el
que se decide, no un cálculo distinto.

De ahí salen las dos cosas que en Ads llevan dólares, y salen del mismo lugar:

```
retorno_usd[rango] = Σ pacientes_nuevos[pais] × LTV_USD[pais]
ROAS               = LTV_USD / CAC
```

Al lado del retorno diario va el **múltiplo de la inversión**:

```
retorno_por_dolar = retorno_usd[rango] / gasto_usd[rango]
```

Es el mismo LTV/CAC pero de **toda la cuenta**, y es más generoso que el ROAS
de cualquier fila de la tabla: el numerador cuenta todos los pacientes nuevos
del período —incluidos los orgánicos— y el denominador solo el gasto pago. Es
la misma simplificación deliberada que ya tiene el CAC (§4), no un cálculo
distinto. Últimos 30 días: US$ 60.900 de retorno sobre US$ 11.995 de gasto,
**5,1x**, con un CAC de cuenta de US$ 15,1.

Mirando un solo país el LTV es el de ese país; mirando TOTAL es el promedio de
los dos ponderado por la mezcla real de pacientes del rango, así el ratio se
mueve con la mezcla igual que se mueve la plata.

El de 90 días (AR US$ 21,6) sigue siendo el comparable estricto contra el CAC
del mes y no se usa acá. Los umbrales 1,3 / 1,8 vienen de la planilla de Growth
Control, que razona con estos mismos 60 y 120, así que quedan en escala.

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

**Decidido el 2026-09-16: queda así, con todos los pacientes nuevos.** La
alternativa era contar solo los atribuidos a canal pago, que es lo que hace la
planilla de Growth Control y da bastante más caro — julio AR, US$ 23,76 contra
US$ 13,70. El tablero mide cuánto cuesta traer un paciente con la plata que se
gasta, no cuánto cuesta un click, así que el denominador son todos.

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

## 6 bis. Funnel por período, sobre compradores

Decidido el 2026-09-18. La pantalla vieja seguía cohortes de **registro**, mes
a mes. Esta sigue **compradores** sobre un período libre, y la compra es la
base del embudo, no una etapa intermedia.

**La cohorte es el día de la compra.** No el mes: la fecha de corte de madurez
de una etapa cae en un día cualquiera, así que el agregado tiene que estar al
día. Comprador = paciente con su **primer** pago confirmado en la ventana
(`pacientes_pagos.confirmado = 1`, fecha `creacion`, día local UTC−3).

**Las sesiones se cuentan sobre toda la vida del paciente**, sin ventana, igual
que en la cohorte mensual. Llegar a la sesión *n* es haber hecho *n* o más, así
que la tabla es acumulativa por construcción y la caída entre dos etapas es una
división.

### Filtros

Período de 90, 180 o 365 días. No hay rangos más cortos a propósito: con 30
días excluidos del hero de no-retorno y 55 días de madurez para la 6ª sesión,
un período de 30 días se queda sin cohorte que mirar.

### Madurez por etapa

Cada etapa se calcula **solo sobre los compradores del período que tuvieron
tiempo de llegar a ella**. Días necesarios desde la compra:

| Etapa | Días | De dónde sale |
|---|---|---|
| Compraron | 0 | es la base |
| 1ª sesión | 10 | p80 de compra → 1ª sesión (§5, §8) |
| 2ª sesión | 19 | + 9 días de promedio entre sesiones |
| 3ª sesión | 28 | + 9 |
| 4ª sesión | 37 | + 9 |
| 5ª sesión | 46 | + 9 |
| 6ª sesión | 55 | + 9 |

`madurez(n) = 10 + (n − 1) × 9`. Se usa el p80 y no la mediana: una etapa está
madura cuando la mayoría de la cohorte tuvo el tiempo, no cuando lo tuvo la
mitad.

**Medido de nuevo sobre estas tablas, ya con compradores y no registros** (AR,
últimos 90 días): compra → 1ª sesión tiene mediana 2 días y p80 5; los tramos
entre sesiones tienen mediana 7 y p80 entre 10 y 13. La cadencia es semanal,
que es lo que uno esperaría de terapia.

Con esos números la fórmula medida sería `5 + (n − 1) × 11`, así que las
constantes de arriba son **estrictas al principio y algo flojas al final**: la
6ª sesión pediría 60 días en lugar de 55. Quedan como están por ahora.
Recalibrar mueve todos los números de la pantalla y es una decisión, no un
arreglo.

Si en el período elegido ningún comprador tiene esa edad, **la fila va vacía**.
Nunca un número sobre pocos casos, y nunca un cero: cero llegadas y ninguna
oportunidad de llegar no son lo mismo. Cada fila muestra su `n`, que es la
cantidad de compradores maduros sobre la que se calcula.

### Las dos columnas de porcentaje

| Columna | Fórmula | Qué lee |
|---|---|---|
| % del total | `llegaron[n] / n_maduros[n]` | retención acumulada contra la compra |
| Se quedaron acá | `(llegaron[n] − llegaron[n+1]) / n_maduros[n+1]` | cuánta gente **terminó** su terapia en esa etapa |

**Un solo criterio, y es la gente que está EN cada etapa.** La fila de la 1ª
sesión habla de los que hicieron una primera sesión: cuántos llegaron y
cuántos terminaron ahí. **No** muestra el escalón de entrada a la etapa, que es
la misma tabla leída al revés y era el motivo de que esa fila pareciera decir
que solo el 5% se cae en la primera sesión. Ese 5% existe, pero es de
"Compraron" —pagó y no se sentó nunca—, no de la 1ª sesión, donde termina un
tercio. El escalón de entrada quedó como tooltip de la celda, no como columna.

**"Se quedaron acá" es la pregunta que se hace en voz alta** —"¿cuántos
hicieron una sola sesión?"— y no se puede leer de las otras dos columnas. Es
gente que llegó a esa etapa y no pasó a la siguiente, así que se mide con la
madurez de la etapa **siguiente**: quien compró hace doce días llegó a su
primera sesión y no tuvo tiempo de una segunda, y contarlo como "se quedó en
una" sería contar el calendario.

Medido en AR / 90 días: 5,0% no arrancó nunca, **33,4% se quedó en una sola
sesión**, 12,4% en dos, 9,6% en tres. La fila amarilla del embudo mide lo
primero y no lo segundo — son dos cosas distintas y la confusión entre las dos
es el motivo de que esta columna exista.

Las dos, siempre: la primera dice cuánta gente queda, la segunda dónde
termina. Y las dos se calculan **sobre la misma población**: el `llegaron[n−1]` del
escalón se recalcula dentro del corte de madurez de la etapa *n*, no se toma de
la fila de arriba. Una caída medida entre dos denominadores distintos no es una
caída.

El delta es contra el **período anterior del mismo largo**, en puntos
porcentuales, sobre "Se quedaron acá". Verde si termina menos gente ahí, ámbar
si termina más.

### No vuelven tras la 1ª

```
no_vuelven = llegaron[1] − llegaron[2]   (compras hasta hoy − madurez(2))
pct        = no_vuelven / compradores    (la misma base que la tabla)
```

**La card ES la fila de la 1ª sesión de la tabla**, no otra cuenta de lo mismo.
Tuvo su propio corte de 30 días y por lo tanto su propio número —333 contra 398
en la tabla, el mismo día y el mismo país— que es exactamente lo que este
proyecto no permite. Ahora hereda `madurez(2)`, 19 días, que es el corte de la
fila: suficiente para que el comprador mediano haya tenido su primera sesión
(2 días de mediana) y la segunda (7 más).

La card muestra la cantidad de personas, el porcentaje sobre compradores, el
delta en puntos contra el período anterior, y debajo sobre cuántos compradores
se calcula y hasta qué fecha de compra.

No se llama "caída de 1ª sesión": ese nombre se confunde con los que compran y
nunca se sientan, que es el escalón *compra → 1ª* de la tabla.

### Tiempo entre sesiones

**Ya no se muestra en pantalla** (2026-09-18): la tabla de tiempos salió del
Funnel junto con la lectura automática. La tabla `marketing.funnel_tiempos` se
sigue sincronizando igual, porque de ahí salen los p80 medidos que calibran las
constantes de madurez de §6 bis — si se dejara de llenar, los cortes de cada
etapa quedarían sin fundamento medible.

Tramos: compra → 1ª, y 1ª → 2ª hasta 5ª → 6ª. Mediana y p80 en días locales
(UTC−3), nunca UTC. Un tramo madura con la etapa a la que llega, así que usa el
mismo corte que ella.

Se guarda el **histograma** de días, no la mediana: una mediana no se suma, y la
pantalla suma el rango que se le pida. Con la distribución, la mediana y el p80
de cualquier ventana salen exactos. Percentil por rango cercano, sin
interpolar: los valores son días enteros y una mediana de 4,5 días no se puede
accionar.

Una brecha negativa se lleva a cero. Pasa cuando hubo una sesión de cortesía
antes del pago, y una espera no puede ser menos que nada.

### Lectura automática

**Retirada el 2026-09-18.** La reemplazó el panel "Dónde se pierde" de §6 ter,
que dice lo mismo sin redactarlo: los tramos ordenados por gente perdida y el
peso del peor sobre el total. Las reglas quedan acá por si alguna vez se
vuelve, y porque el panel las respeta:

1. **La etapa más cara** es la etapa madura donde terminó **más gente**,
   contada en personas y no en porcentaje, así una etapa chica con una tasa
   alta no puede ganar. Incluye "Compraron", que es pagar y no sentarse nunca.
2. **Cuánto pesa** es `se_quedaron[peor] / Σ se_quedaron[todas las maduras]`,
   dicho como "es X% de todo lo que se pierde hasta la 6ª sesión".
3. **Si viene mejorando** sale del delta de esa misma etapa contra el período
   anterior: mejora o empeora con un punto porcentual o más de movimiento,
   estable dentro de eso.

### Verificado contra `sesiones` el 2026-09-18

`/api/cron/funnel-check?pais=AR&periodo=90` cuenta las mismas etapas directo de
MySQL, escrito a propósito con otra forma (sumas condicionales en una pasada,
en lugar de una distribución expandida en JavaScript), y compara contra lo que
lee la pantalla. Dio `todo_coincide: true`:

| Etapa | Corte | n | Llegaron | % del total | % caída |
|---|---|---|---|---|---|
| Compraron | 2026-09-17 | 1.570 | 1.570 | 100,0% | — |
| 1ª sesión | 2026-09-07 | 1.376 | 1.307 | 95,0% | 5,0% |
| 2ª sesión | 2026-08-29 | 1.193 | 743 | 62,3% | 34,9% |
| 3ª sesión | 2026-08-20 | 1.037 | 524 | 50,5% | 19,8% |
| 4ª sesión | 2026-08-11 | 855 | 348 | 40,7% | 19,1% |
| 5ª sesión | 2026-08-02 | 633 | 207 | 32,7% | 23,0% |
| 6ª sesión | 2026-07-24 | 487 | 126 | 25,9% | 20,3% |

El escalón más caro es 1ª → 2ª con 34,9%.

### Por qué el escalón compra → 1ª sesión da solo 5%

Es correcto, y vale explicarlo porque el número parece bajo. Medido sobre los
1.376 compradores de AR con al menos 10 días de antigüedad:

| Caso | Compradores |
|---|---|
| Primera sesión **después** de pagar | 1.151 |
| Primera sesión **el mismo día** que pagó | 156 |
| Primera sesión **antes** de pagar | **0** |
| Sin ninguna sesión realizada | 69 (el 5,0%) |

**Nadie se sienta antes de pagar.** Cero de 1.376: en esta plataforma agendar
requiere paquete comprado, así que la secuencia siempre es comprar → agendar →
asistir. La etapa no está inflada por sesiones de cortesía, que era la primera
sospecha.

Los 69 que no tienen ninguna sesión realizada se parten en dos problemas
distintos: **41 nunca agendaron** y **28 agendaron y la sesión nunca se marcó
realizada**. El segundo grupo es el no-show de verdad; el primero es alguien
que pagó y no eligió horario.

**El flag `realizada` discrimina de verdad**, que es la otra cosa que había que
descartar: entre estos mismos compradores hay 3.908 sesiones con
`realizada = 1` y 788 con `realizada = 0`. Si el flag se marcara solo, todas
estarían en 1 y todas las etapas del embudo estarían mal.

Si se exigiera que la primera sesión sea **estrictamente posterior** al día del
pago, la caída daría 16,4%. No se hace: las 156 del mismo día son sesiones
reales, y excluirlas sería inventar una pérdida que no existe.

No vuelven tras la 1ª, mismo corte: **333 personas, 34,8%**, sobre 956
compradores con 1ª sesión, hasta compras del 2026-08-18.

---

## 6 ter. Funnel por cohorte

Es la otra mitad de §6 bis, no un reemplazo, y la diferencia importa.

§6 bis mira una **ventana móvil** de 90, 180 o 365 días. Adentro de esa ventana
conviven el que compró ayer y el que compró hace un año, así que cada etapa
tiene que cortarse en su propia madurez y cada porcentaje lleva su propio
denominador. Es la foto del momento, y sirve para comparar contra el período
anterior.

§6 ter mira una **cohorte**: un mes de compradores seguido hacia adelante.
Todos compraron el mismo mes, la cohorte entera tiene una sola edad, y entonces
los siete porcentajes se leen contra un único denominador —los compradores del
mes— sin más aclaraciones. Es lo único que permite comparar un mes contra otro
sin que la diferencia sea el calendario.

**No hay rango libre de fechas en esta vista.** Un rango arbitrario mezcla
gente con distinta madurez y produce una caída que es en parte el almanaque.

### Edad de la cohorte

Se mide desde el **último comprador del mes**, no desde el primero ni desde el
fin del mes calendario: es el más joven el que decide si la cohorte ya puede
contestar una pregunta. La cohorte responde por la etapa `k` cuando su edad
llega a `madurez(k)` de §6 bis, y hasta entonces esa etapa va vacía con los
días que faltan. Nunca un porcentaje sobre pocos casos.

Con `madurez(6) = 55`, una cohorte necesita unos dos meses cerrados para
dibujar el embudo entero. Por eso el mes que se abre por defecto es **la
cohorte más nueva con madurez completa**, y no el mes en curso: abrir en el mes
en curso mostraría un embudo casi todo vacío.

### Caída de un tramo

`perdidos[t] = llegaron[t] − llegaron[t+1]`, y el porcentaje es sobre
`llegaron[t]`. Como `llegaron[k]` es "hizo k sesiones o más", la resta da
exactamente los que hicieron **exactamente** `t` sesiones — que es la misma
definición que usa la exportación del CSV para elegir a quién bajar. Si esos
dos números alguna vez no coinciden, uno de los dos está mal.

Un tramo madura con su **etapa de destino**: saber cuántos no pasaron a la
siguiente exige que la siguiente ya haya tenido tiempo de pasar.

### Dónde se pierde

Los tramos se ordenan por **gente perdida**, no por porcentaje, y el primero
lleva qué parte del total perdido se lleva. La diferencia es entre "el tramo
1ª→2ª pierde 34%" y "se lleva 127 personas, la mitad de todo lo que perdés":
lo segundo es lo que dice dónde trabajar. Un tramo tardío puede tener la peor
tasa y mover veinte personas, porque a esa altura ya queda poca gente.

La barra de cada tramo es relativa al **peor tramo**, no al total: contra el
total todas quedarían cortas y parecidas.

### Verificado contra la base el 2026-09-18

AR, cohorte 2026-06, 384 compradores, 80 días de madurez:

| Etapa | Llegaron | % del total | Caída del tramo |
|---|---:|---:|---|
| Compraron | 384 | 100% | |
| 1ª sesión | 372 | 97% | −12 · 3% |
| 2ª sesión | 245 | 64% | −127 · 34% |
| 3ª sesión | 198 | 52% | −47 · 19% |
| 4ª sesión | 175 | 46% | −23 · 12% |
| 5ª sesión | 152 | 40% | −23 · 13% |
| 6ª sesión | 133 | 35% | −19 · 13% |

Se pierden 251 personas hasta la 6ª. El tramo 1ª→2ª se lleva 127, el **51%**
de todo. Es el mismo hallazgo que §6 bis cuenta como "la terapia termina más
que en ninguna otra parte en la 1ª sesión", visto por cohorte en vez de por
ventana.

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

### Qué card muestra qué comparación

No todas muestran la pendiente. Cada una muestra la comparación que su métrica
puede sostener:

| Card | Pie | Por qué |
|---|---|---|
| Pacientes nuevos, Registros | El mismo tramo del mes anterior | Son sumas del mes, así que medio septiembre contra medio agosto compara lo mismo |
| Pacientes activos, Conversión | Los dos últimos meses **cerrados**, nombrados | Un conteo distinto no se prorratea y una cohorte de 30 días no madura a mitad de mes |
| Sesiones por paciente | Diferencia cruda + pendiente debajo | Se mueve de a décimas: "+0,2" dice la cosa, "+4%" la esconde |
| El resto | Pendiente de 6 meses | Nadie abre la pantalla a preguntar qué pasó un mes puntual |

El pie de activos y conversión **nombra los dos meses** ("ago vs. jul") aunque
arriba el número grande sea el del mes en curso. Sin eso el delta parecería
hablar del número que tiene encima, que es otro mes.

Cada unidad se lee en lo suyo y mezclarlas era el error: una tasa se mueve en
puntos porcentuales —de 9,5% a 9,4% es −0,1 pp, y como relativo sería −1,6%,
que suena a otra cosa— y un conteo se mueve en porcentaje.

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
  mediana_dias_compra numeric,   -- registro -> primer pago
  p80_dias_compra     numeric,
  mediana_dias_sesion numeric,   -- registro -> primera sesion realizada
  p80_dias_sesion     numeric,
  compran_24h         numeric,
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

### `marketing.permisos` y `marketing.export_log`

No son agregados: son el control de la única exportación que toca datos
personales (CLAUDE.md).

`permisos` tiene una fila por cuenta habilitada a exportar. Tener cuenta
alcanza para ver todos los números del dashboard; no alcanza para bajarse
nombres y mails. Sin fila, o con `export_pii = false`, la celda de la grilla
muestra el número y no descarga.

`export_log` se escribe **antes** de mandar cada archivo: usuario, mail,
cohorte, tramo, país, filas y timestamp. Si esa escritura falla, la descarga no
sale. Una exportación sin registro es exactamente la situación que había con la
contraseña compartida.

### Las tablas del Funnel son la excepción a "nunca recalcular un mes cerrado"

```sql
create table marketing.funnel_etapas (
  fecha_compra date not null,   -- día local del primer pago confirmado
  pais         text not null,
  nro_sesion   int  not null,   -- 0 = compró; 1..12 = llegó a esa sesión
  pacientes    int  not null,
  primary key (fecha_compra, pais, nro_sesion)
);

create table marketing.funnel_tiempos (
  fecha_compra date not null,
  pais         text not null,
  tramo        int  not null,   -- 0 = compra -> 1ª ... 5 = 5ª -> 6ª
  dias         int  not null,
  pacientes    int  not null,
  primary key (fecha_compra, pais, tramo, dias)
);
```

Una cohorte de compradores **no deja de moverse nunca**: quien compró en marzo
puede hacer su sexta sesión en septiembre, así que la fila de marzo es distinta
hoy que ayer. El job reescribe una ventana móvil de 760 días de fechas de
compra en cada corrida, no solo el mes en curso.

760 y no 365 porque la pantalla compara contra el período anterior del mismo
largo: un período de 365 días necesita 730 días de historia detrás, más margen.

Es barato a pesar del largo: un día tiene un puñado de compradores, así que la
ventana entera son decenas de miles de filas, todas agregadas del lado de
MySQL. Se borra y se reinserta el rango en una transacción, en lugar de hacer
upsert: un pago que se desconfirma tiene que desaparecer, y un upsert lo
dejaría ahí para siempre.

`marketing.metricas_mensuales` sigue intacta bajo la regla original. La
excepción es de estas dos tablas y de ningún otro agregado.

`marketing.cohorte_sesiones` se queda donde está, con la cohorte de registro
mensual: de ahí sale la exportación de cohorte (`/api/funnel/csv`). Son dos
preguntas distintas y no se pisan.

---


### Dos distancias distintas, no una mal medida

`mediana_dias_compra` mide **registro → primer pago**. Da 0 con p80 de 3: pagar
es un click y la mayoría lo hace el mismo día. Está bien medida.

`mediana_dias_sesion` mide **registro → primera sesión realizada**, que es la
distancia de la que habla el Funnel: conseguir un lugar en la agenda lleva
entre 3 y 5 días, con p80 entre 9 y 13.

Medido sobre cohortes de mayo a julio de 2026:

| | Hasta el pago | Hasta la 1ª sesión |
|---|---|---|
| AR | mediana 0 · p80 4–6 | mediana 3–4 · p80 9–11 |
| UY | mediana 0 · p80 4–5 | mediana 4–5 · p80 11–13 |

La card del Funnel muestra la segunda y se llama "Hasta la 1ª sesión". La
primera se sigue guardando: cuán rápido paga la gente es una pregunta real,
solo que no es la del embudo.

`compran_24h` sale del mismo histograma del pago: qué proporción pagó dentro
del día.


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
