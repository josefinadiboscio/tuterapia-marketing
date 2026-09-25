# INSIGHTS.md — Pestaña de análisis con IA

Reemplazó a Admin como quinta pestaña. Los parámetros pasan a cargarse en el
backend de Tu Terapia; las tablas de `marketing.parametros` y
`marketing.utm_mapping` siguen existiendo, solo se fue la pantalla.

---

## Qué es

Un análisis **semanal**, generado automáticamente. El usuario no lo pide: entra
y ya está. Lee los agregados, encuentra dónde hay para ganar, y dice cuál es el
próximo movimiento.

**Un análisis por semana, no seis tarjetas por día.** Un tema principal —lo más
importante de la semana— y dos o tres notas más breves debajo. Una pestaña que
pide atención todos los días la gasta; una vez por semana, con una sola cosa
importante, se lee.

---

## Tono: crecimiento, no diagnóstico

El encuadre se orienta a la oportunidad. **Los números no se tocan.**

Una caída se enuncia por lo que hay para recuperar, no por lo que se rompió.
"El CAC subió 34%" se convierte en "hay US$ 5 por paciente para recuperar en
Meta". La magnitud real sigue citada en la banda de datos, sin suavizar.

- **Los titulares apuntan a la palanca, no al síntoma**: qué se puede ganar,
  cuánto y dónde.
- **Las recomendaciones son el próximo movimiento, no una corrección.** En vez
  de "bajá el presupuesto de X", "probá mover ese presupuesto a Y y medí dos
  semanas".
- **Cuantificá la oportunidad en pacientes o en dólares de margen** cada vez
  que se pueda. "Si la conversión de esta campaña igualara el promedio de su
  plataforma, serían 18 pacientes más por mes" vale mucho más que decir que
  está por debajo.
- **Nunca escondas un problema.** Si algo empeoró, se dice con su número. Lo
  que cambia es que se presenta junto a lo que se gana al resolverlo.

### Severidad: tamaño de oportunidad, no alarma

Dos estados y nada más:

| Estado | Color | Cuándo |
|---|---|---|
| `alta` | naranja `#E8833F` (`--orange`) | Donde hay más para ganar |
| `normal` | neutro (`--border` / `--dim`) | El resto |

**El coral no se usa en esta pestaña.** Una pantalla que abre con tres cosas en
rojo enseña a no abrirla, y esta existe para que se abra. El color vive en el
borde izquierdo y en la etiqueta, en ningún otro lado.

El orden es por tamaño de oportunidad, no por cuán alarmante suena: 48
pacientes al mes es `alta` aunque el hallazgo sea aburrido, y 15 es `normal`
aunque la acción sea más obvia.

---

## Regla no negociable

**Todo número citado sale de las tablas de agregados de `marketing`. El modelo
no calcula, no estima y no infiere cifras.**

El pipeline arma un contexto estructurado con los agregados relevantes y el
modelo escribe sobre eso. Si un insight no puede citar la fuente de cada número
que menciona, no se publica. Por eso cada entrada de `datos` lleva un campo
`fuente` con el nombre de la tabla: no es decorativo, es la condición.

---

## Dónde corre el generador — leer esto antes de buscarlo en el código

**No hay generador en este repositorio.** La app solo lee `marketing.insights`
y la dibuja. Las filas las escribe un agente (Claude Code) que corre en una
rutina programada, lee los agregados por el MCP de Supabase y hace el insert.

Se eligió así el 2026-09-19, sobre las otras dos opciones: llamar a la API de
Claude desde un route handler (~US$ 11 al mes, una `ANTHROPIC_API_KEY` en
Vercel) o detectar por reglas sin modelo.

**Lo que esto implica, y no es menor:** el análisis depende de una
infraestructura que no es la de este proyecto y que no se monitorea desde acá.
El día que la rutina deje de correr, los insights dejan de aparecer y nada lo
avisa. La pantalla mitiga la parte visible —muestra siempre la fecha del
análisis y cuántos días hace que se generó, así un análisis viejo se ve
viejo— pero la mitigación es que se note, no que no pase.

Si esto pasa a producción de verdad, el camino es mover la generación a
`/app/api/cron/insights` con la API de Claude y dejar esta rutina como lo que
es: una forma de probar sin pagar.

### Estado al 2026-09-25

Las seis piezas que hay se escribieron a mano en una sesión de Claude Code y se
migraron a la semana del 14 al 20 de septiembre. La rutina **existe pero está
deshabilitada**: se creó desde la sesión y no quedó con los conectores de
Supabase, así que al dispararse no podría ni leer los agregados ni escribir la
tabla. Para que corra hay que crearla desde la UI de rutinas de claude.ai,
donde el conector se puede adjuntar. Su cron es `0 11 * * 1` — lunes 8 de la
mañana de Montevideo, después de la sincronización.

Mientras siga así, el análisis se genera a mano o no se genera. La pantalla
dice cuántas semanas hace que no se publica, que es lo único que evita que eso
pase inadvertido.

---

## Estructura de la pantalla

**Filtro de país arriba** (Total / AR / UY), como el resto de la app.

**El período analizado como título**: "Semana del 14 al 20 de septiembre". Es
el período, no la fecha en que corrió el job — el análisis del lunes 21 habla
de la semana que terminó el domingo 20.

**El tema de la semana**, una sola tarjeta, grande. Lo más importante que pasó.

**"También esta semana"**: dos o tres notas más breves.

**Tope de un tema y tres notas.** Un modelo puede escribir quince observaciones
ciertas y triviales; el trabajo es elegir, y el tope obliga a elegir.

**Semanas anteriores**: el archivo, una fila por semana con su período y el
titular de su tema, clickeable. Un archivo de fechas sin titular no invita a
abrir nada.

Si el análisis que se muestra no es el de la semana que corresponde, la
pantalla lo dice en rojo: *"Hace 2 semanas que no se publica"*. Un análisis
viejo tiene que verse viejo.


Al pie, **Pendientes**: los valores que se cargan a mano y su antigüedad, los
meses cerrados sin tipo de cambio, y los `utm_source` con volumen sin mapear.
Venía de Admin y no podía desaparecer con ella — son cosas que no se rompen
cuando envejecen, se desvían.

---

## Anatomía de un insight

| Parte | Columna | Contenido |
|---|---|---|
| Titular | `titular` | Una frase. Apunta a la palanca, con la magnitud adentro |
| Cuerpo | `cuerpo` | Dos o tres oraciones. Prosa corta, sin viñetas ni encabezados |
| Banda de datos | `datos` | Los números con su valor anterior, el actual y su tabla |
| **Próximo movimiento** | `recomendacion` | Bloque separado, encabezado "Próximo movimiento" |
| Enlaces | `enlaces` | "Ver en [pestaña]", uno por dominio involucrado |
| Descartar | `estado` | Acción para no volver a verlo |
| Rol | `rol` | `tema` (uno por semana) o `nota` |

**La recomendación va separada del hallazgo, siempre.** El usuario tiene que
poder aceptar el dato y rechazar la sugerencia sin descartar las dos cosas.

La severidad está arriba, en **Tono**: dos estados, naranja y neutro.

---

## Estilo de escritura

Los insights tienen que leerse como si te los contara alguien que conoce el
negocio, no como salida de un sistema.

- **Frases cortas y directas.** Nada de "se observa que", "cabe destacar", "es
  importante mencionar".
- **Nombrá las cosas como las nombra el equipo**: campañas por su UTM, países
  por su nombre, plata en dólares.
- **Una idea por oración.** Si hace falta una subordinada para explicarla, se
  parte en dos.
- **Sin adjetivos de relleno.** "Significativo", "notable", "considerable" no
  dicen nada al lado de un número.
- **Nada de encabezados internos ni viñetas dentro del cuerpo.** Es prosa
  corta.
- **Que no arranque siempre igual.** Si los seis insights empiezan con la misma
  estructura, se lee como plantilla.
- **Prohibido el condicional vago.** "Podría estar indicando" es "indica" o no
  se dice.

Lo que no sirve:

> Se observa una variación significativa en el costo de adquisición del canal
> Meta que podría estar indicando una oportunidad de optimización.

Lo que sí:

> Meta te está costando US$ 5 más por paciente que hace un mes. Si volvés al
> costo de agosto, son unos US$ 900 de margen al mes.

La diferencia no es de vocabulario. El primero no dice cuánto subió, ni sobre
qué base, ni qué se gana arreglándolo — tres oraciones de nada. El segundo dice
el número, la comparación y la plata, en dos.

---

## Generación

Corre **los lunes a la mañana**, después del job de sincronización, sobre la
**semana cerrada anterior** (lunes a domingo). Nunca a pedido del usuario: si
hay que apretar un botón, no se aprieta.

El lunes a la mañana la semana en curso tiene medio día de datos, y medio día
no es una semana. Por eso el análisis del lunes 21 habla del 14 al 20.

### Todas las comparaciones son semana contra semana

Ni día contra día, ni mes contra mes: la semana cerrada contra la anterior.

Una comparación diaria sobre una serie con fin de semana dice cualquier cosa
—un lunes contra un domingo es −70% de puro calendario— y a nivel semanal ese
ruido se cancela solo.

Cuando un hallazgo solo tiene sentido en una ventana más larga (una tendencia
de seis meses, una cohorte de funnel), se dice con su ventana explícita en el
texto. Lo que no se hace es presentar un movimiento mensual como si fuera de la
semana.


### Deduplicación

Un hallazgo de la semana pasada **no se repite**, salvo que la oportunidad haya
crecido de forma clara. En ese caso vuelve, con `agravado_de` apuntando a la
fila anterior, y la pantalla lo marca.

Un insight descartado por el usuario no vuelve por 30 días, y si reaparece es
porque cruzó un umbral mayor.

El `hash` es la identidad del **hallazgo**, no de la fila: dos corridas que
encuentran la misma cosa producen el mismo hash aunque el texto salga redactado
distinto. El índice único `(semana, pais, hash)` hace idempotente al generador
— si corre dos veces el mismo lunes, no duplica.

Un índice único parcial garantiza **un solo `tema` por semana y país**. La
regla vive en el esquema, no en la confianza de que el prompt se respete.


### Semanas sin novedades

**Si la semana no tuvo movimientos relevantes, la pestaña lo dice.** No se
rellena con observaciones triviales para tener contenido, y el archivo de
semanas anteriores sigue ahí.

Es preferible a acostumbrar al usuario a leer ruido y que termine ignorando la
pestaña — que con una frecuencia semanal importa más, porque hay menos
oportunidades de recuperar su atención.

---


## Qué buscar

**Dentro de General**
- Divergencias entre volumen y calidad (registros bajan pero conversión sube)
- Quiebres de tendencia en cualquier serie de 6+ meses
- Cambios en el mix de plataformas

**Dentro de Ads**
- Campañas que cruzaron un umbral de decisión esta semana
- Conversión muy por debajo del promedio de su plataforma y país
- Fuentes orgánicas con rendimiento superior al pago

**Dentro de Funnel**
- Tramos que empeoran o mejoran de forma sostenida entre cohortes
- Cambios en los tiempos entre sesiones
- Divergencia de caída entre canales

**Cruces entre dominios — los más valiosos**
- CAC que sube sin que suba el costo por registro → el problema está en
  conversión o en retención, no en el tráfico
- Una campaña con buen CAC cuyos pacientes caen más que el promedio → su LTV
  real es menor al que asume el ratio
- Mejoras de funnel que cambian el techo de CAC tolerable por canal

---

## Lo que el modelo no hace

- No calcula números por su cuenta
- No recomienda apagar o escalar campañas sin citar el ratio y los umbrales
  de `METRICAS.md` §Growth Control
- No opina sobre cohortes sin madurez suficiente
- No menciona pacientes individuales ni datos personales
- No repite lo que ya dice un gráfico sin agregar una conexión nueva
- No suaviza un número para que el encuadre positivo cierre: si algo empeoró,
  la banda de datos lo dice con la magnitud real
- No usa el condicional para cubrirse — "podría estar indicando" es "indica" o
  no se dice

---

## Pendientes

- [ ] Definir el umbral de "creció" para republicar un hallazgo descartado
- [ ] Decidir qué pasa si una semana se genera tarde: ¿se publica igual con su
      período, o se saltea?
- [ ] Decidir si los insights se archivan y son consultables hacia atrás
- [ ] Evaluar si vale mandar el análisis semanal por mail además de la pestaña
- [ ] Mover la generación a un route handler cuando esto deje de ser una prueba
