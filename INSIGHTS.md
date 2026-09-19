# INSIGHTS.md — Pestaña de análisis con IA

Reemplazó a Admin como quinta pestaña. Los parámetros pasan a cargarse en el
backend de Tu Terapia; las tablas de `marketing.parametros` y
`marketing.utm_mapping` siguen existiendo, solo se fue la pantalla.

---

## Qué es

Un análisis generado automáticamente después de cada sincronización. El usuario
no lo pide: entra y ya está. Lee los agregados, encuentra lo que merece
atención, y recomienda qué hacer.

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

---

## Estructura de la pantalla

**Filtro de país arriba** (Total / AR / UY), como el resto de la app. Fecha de
generación al lado, con la antigüedad cuando pasó más de un día.

**Bloque "Lo más importante hoy"** — uno o dos insights, los de mayor impacto,
destacados. Pueden cruzar dominios y son los más valiosos: conectan pantallas
que el usuario mira por separado. En la tabla son `dominio = 'cruce'`.

**Después, por dominio:** General, Ads, Funnel. Uno o dos cada uno como máximo.

**Tope de seis insights en total.** Un modelo puede escribir quince
observaciones ciertas y triviales; el trabajo es elegir.

Al pie, **Pendientes**: los valores que se cargan a mano y su antigüedad, los
meses cerrados sin tipo de cambio, y los `utm_source` con volumen sin mapear.
Venía de Admin y no podía desaparecer con ella — son cosas que no se rompen
cuando envejecen, se desvían.

---

## Anatomía de un insight

| Parte | Columna | Contenido |
|---|---|---|
| Titular | `titular` | Una frase, concreta, con la magnitud adentro |
| Cuerpo | `cuerpo` | Dos o tres oraciones explicando qué se observó |
| Banda de datos | `datos` | Los números con su valor anterior, el actual y su tabla |
| **Recomendación** | `recomendacion` | Bloque visualmente separado, con su propio encabezado |
| Enlaces | `enlaces` | "Ver en [pestaña]", uno por dominio involucrado |
| Descartar | `estado` | Acción para no volver a verlo |

**La recomendación va separada del hallazgo, siempre.** El usuario tiene que
poder aceptar el dato y rechazar la sugerencia sin descartar las dos cosas.

### Severidad, por el borde izquierdo

- Coral `#E5705A` (`--coral`) — alerta, algo empeoró
- Verde `#6BAF7A` (`--green`) — oportunidad
- Neutro — observación

El color vive en el borde y en la etiqueta, en ningún otro lado. Pintar el
fondo entero de coral convierte una observación en una alarma.

---

## Generación

Corre **después del job de sincronización**, una vez por día. Nunca a pedido
del usuario: si hay que apretar un botón, no se aprieta.

### Deduplicación

Un insight que ya se mostró ayer **no se repite**, salvo que la métrica haya
empeorado de forma significativa desde entonces. En ese caso se muestra de
nuevo, con `agravado_de` apuntando a la fila anterior, y la pantalla lo marca.

Un insight descartado por el usuario no vuelve a aparecer por 30 días, y si
reaparece es porque cruzó un umbral peor.

El `hash` es la identidad del **hallazgo**, no de la fila: dos corridas que
encuentran la misma cosa producen el mismo hash aunque el texto salga
redactado distinto. El índice único `(fecha, pais, hash)` hace idempotente al
generador — si corre dos veces el mismo día, no duplica.

### Días sin novedades

**Si no hay nada que merezca aparecer, la pestaña lo dice.** No se rellena con
observaciones triviales para tener contenido.

Es preferible a acostumbrar al usuario a leer ruido y que termine ignorando la
pestaña.

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

---

## Pendientes

- [ ] Definir el umbral de "empeoró significativamente" para republicar un
      insight descartado
- [ ] Decidir si los insights se archivan y son consultables hacia atrás
- [ ] Evaluar si vale un resumen semanal por mail además de la pestaña
- [ ] Mover la generación a un route handler cuando esto deje de ser una prueba
