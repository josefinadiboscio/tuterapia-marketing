# DESIGN.md — Dirección visual

Esto es una herramienta de trabajo, no una landing page. Se mira todos los
días, a veces varias veces por día, casi siempre para responder una pregunta
concreta. Todo lo que no ayude a responderla más rápido sobra.

---

## Principio

**La tipografía hace la jerarquía, no las cajas.**

Un número grande al lado de una etiqueta chica ya comunica jerarquía. No hace
falta encerrarlo en una tarjeta con borde, sombra y fondo. Cuando todo está en
una caja, nada destaca.

Preferir alineación y espaciado antes que bordes. Una grilla bien alineada se
lee mejor que doce rectángulos.

---

## Números

Los números son la interfaz. Se tratan con cuidado:

- **Tabular figures** (`font-variant-numeric: tabular-nums`) en toda cifra.
  Sin eso las columnas bailan y las comparaciones cuestan.
- Decimales consistentes dentro de una misma métrica. Si la conversión es
  8,7%, el mes anterior es 10,0% — no 10%.
- Separador de miles con punto, decimal con coma (es-UY).
- Moneda siempre explícita: `US$ 115`, no `115`.
- Un número sin contexto no se muestra. Siempre lleva su delta, su período o
  su base al lado.

---

## Tema

**Todo el color vive en tokens CSS en `:root`. Ningún componente escribe un
color.** Cambiar el tema es editar `app/globals.css` y nada más.

**Oscuro por defecto**, con toggle a claro. El oscuro es un verde muy oscuro,
casi negro; el claro mantiene el fondo crema.

**El teal va en `#5FB5B5`, no en `#4A9B9B`.** El fondo oscuro es verde y el
teal es un tono vecino: contra el navy anterior separaba por color, contra este
no. El valor nuevo lleva el contraste de 5,75 a 7,80.

**El toggle es un ícono bordeado**, sol o luna, y muestra a qué modo lleva el
click, no en cuál estás. Una palabra en ese lugar se lee al revés la mitad de
las veces.

```
Oscuro                        Claro
--bg        #0C1410           #FDFAF6
--surface   #141F19           #FFFFFF
--surface-2 #1B2A22           #F5F1E8
--border    #24362C           #E2DDD0
--text      #EDEFE9           #1B2549
--muted     #7E9188           #5C6478

Acentos, los mismos en los dos modos
--orange    #E8833F   principal
--orange-lt #F5A96E
--orange-dk #C25A1A
--teal      #5FB5B5
--gold      #F5D28B
--coral     #E5705A   caída, alertas
--green     #6BAF7A   solo el veredicto "escalar"
```

**El naranja es la marca.** El verde tiene un único uso en toda la app —el
veredicto "escalar" en Ads— y por eso no aparece en ninguna otra parte: si
apareciera decorando, dejaría de significar eso.

## Color

**El color solo comunica significado. Nunca decora.**

**Regla dura: el verde es marca, no estado.** Se usa en gráficos, superficies y
acentos. Si el verde significa "Tu Terapia" y "positivo" a la vez, deja de
significar cualquiera de las dos cosas.

| Uso | Color |
|---|---|
| Delta, tendencia | **texto neutro con flecha** ↑ ↓ → |
| Alerta real (campaña a apagar, parámetro faltante) | rojo |
| Aviso | ámbar |
| En curso | atenuado |
| Gráficos, superficies, acento | rampa de marca |
| Todo lo demás | neutro |

- Nada de gradientes, glassmorphism, sombras de colores ni fondos decorativos.
- **Cada métrica tiene su color, y lo lleva a todos lados.** El borde de su
  card y las barras o la línea de su gráfico son el mismo color, así que se
  sabe qué serie se está mirando sin leer la etiqueta.

| Métrica | Color |
|---|---|
| Registros | `--orange` |
| Pacientes nuevos | `--orange-dk` |
| Pacientes activos | `--teal` |
| Conversión | `--gold` |
| CAC | `--teal` |
| Costo por registro | `--coral` |
| LTV | `--gold` |

- **Con Total seleccionado, las barras se apilan por país**: el país principal
  en el tono de la métrica y el segundo en una versión más clara, con leyenda.
  Una barra plana esconde la composición, que es información.
- **Las tasas no se apilan.** Sumar 8,7% de Argentina con 12,5% de Uruguay no
  da nada. Conversión se dibuja como barra única con el valor del Total.
- **El color nunca es el único portador de información.** La tendencia de una
  card la dan la palabra y la flecha; el color, si está, acompaña.

---

## Densidad

Apuntar a alta densidad. El usuario quiere ver el mes entero sin scrollear.

- Padding chico en las celdas de métrica. No hace falta aire alrededor de cada
  número.
- Sin ilustraciones, sin iconos decorativos. Iconos solo cuando reemplazan
  texto que no cabe.
- Sin títulos de sección grandes. Una etiqueta chica en mayúsculas o en gris
  alcanza para separar bloques.
- Sin emojis en la UI.

---

## Estados

**Una sola convención de tiempo en toda la app: lo que todavía se puede mover
lleva un `·` al lado de su etiqueta y dice "en curso".** Nada más. Se eliminan
de la UI las etiquetas "provisorio", "cohorte inmadura" y "proyectado": son
tres nombres para la misma idea, y obligan a quien mira a aprender un
vocabulario para leer un número.

**El mes en curso no se atenúa.** Atenuarlo lo volvía difícil de leer para
resolver un problema que ya resuelve el delta: comparado contra el mismo tramo
del mes anterior, un mes a medio andar es un número honesto, no uno a medias.
La marca alcanza; bajarle el contraste, no.

El motivo —por qué ese número puede moverse— va en un tooltip. Es la única
excepción a la regla de que un tooltip no guarda información: acá lo que guarda
es la explicación, no el dato.

- **En curso:** en el gráfico, la barra o el punto atenuados y una marca
  discreta en la etiqueta del eje. En la card, nada: la regla de que ninguna
  card lleva texto bajo el número no tiene excepciones.
- **Sin datos suficientes:** no mostrar un número bajo. Mostrar cuánto falta
  ("faltan 138 registros").
- **Vacío:** decir qué hacer para llenarlo, no mostrar un cero.
- **Carga:** skeleton con la forma del contenido, no un spinner centrado.

## Gráficos

- **Barras angostas y separadas**, no bloques a todo el ancho. Una barra gorda
  pesa más que el dato que representa.
- **Cada barra lleva su valor arriba.** Si hay que estimar la altura contra un
  eje, el número no está.
- **Eje Y con dos o tres referencias**, no más. Es una escala, no una regla.
- **El eje X lleva el nombre del mes abreviado en español** — abr, may, jun —
  nunca `26-04`. El año aparece solo cuando la serie cruza de un año a otro.
- **El mes en curso va atenuado** en su barra o su punto, con una marca
  discreta en la etiqueta del eje. Nada de texto.

## Cards

**Ninguna card lleva texto explicativo debajo del número.** Nada de "primer
pago confirmado", "con sesión en el mes", "ventana de 30 días". La card muestra
el nombre de la métrica, el valor y la tendencia. La definición va en el
tooltip, para quien la busque.

**Sobre meses cerrados la tendencia va en palabras, no como delta contra el
mes anterior:** "creciendo · +31% en 6m", "estable · +4% en 6m", "bajando ·
−1,8 pp en 6m". Un mes contra el anterior dice qué pasó una vez; una pendiente
sobre seis meses cerrados dice hacia dónde va la cosa, que es la pregunta con
la que se abre el tablero.

**Mientras el mes corre, esa línea se reemplaza por el delta contra el mismo
tramo del mes anterior**, y dice contra qué compara: "↓ −7% vs. los primeros 15
días del mes anterior". Solo en las métricas que son suma del mes —registros y
pacientes nuevos—. Pacientes activos queda con la pendiente: es un conteo
distinto sobre una ventana, así que medio mes no tiene la mitad de los
pacientes y el delta leería como un derrumbe que no pasó.

## General

Se organiza alrededor de **series temporales**, no de cards con deltas.

- **Bloque Volumen**, en la familia verde: Registros, Pacientes nuevos,
  Pacientes activos, Conversión — en ese orden. Registros primero porque es la
  entrada del embudo; conversión última porque es la que resume a las otras.
  Gráfico de barras.
- **Bloque Economía**, en la familia teal: CAC, Costo por registro, Sesiones
  por paciente.
  Gráfico de línea, y **la lectura automática va acá abajo**, sobre fondo
  dorado suave — no al pie de la pantalla.
- **Las cards son el selector.** Al clickear una, el gráfico de abajo muestra
  esa serie. Un gráfico por bloque, nunca dos.
- **Selector de rango 6m / 12m** arriba, junto al de país. Tres meses se sacó:
  media docena de cards declaran su tendencia sobre seis meses cerrados, así
  que un rango de tres dibujaba una serie más corta que la pendiente que la
  card de arriba estaba afirmando.
- **Anotaciones según la serie.** Con CAC seleccionado el gráfico dibuja el LTV
  como techo: mientras la línea esté abajo, cada paciente devuelve más de lo
  que costó. Con las demás series no hay banda.
- **El apilado sigue al selector de país.** Con Total las barras se apilan por
  país, que es la composición del total. Con AR o UY elegido no hay segundo
  país que mostrar, así que se apilan por plataforma — con los mismos colores
  del gráfico diario, para que una plataforma sea siempre el mismo color en
  toda la pantalla.
- **Tooltip por `utm_source` crudo**, en el mensual y en el diario. Al pasar el
  mouse: el período, el total, y el desglose por source **tal cual está en la
  base** (`metaarj7`, `tkarg`, `gadspre`), de mayor a menor, las 8 primeras y
  el resto en "otras". Crudo y no agrupado porque ese es el string que alguien
  escribió en una campaña y el único que puede ir a buscar; agrupar sería
  contestar dos veces la pregunta que ya contestan las barras. El desglose es
  **de la métrica seleccionada**: si la card es Pacientes nuevos, el detalle es
  de pacientes nuevos.
- **Gráfico diario en el medio**, entre los dos bloques: barras apiladas por
  día de los últimos 30 días, un color por plataforma, con leyenda. **El título
  y la serie siguen a la card seleccionada**, igual que el mensual. Muestra la
  composición que el agregado mensual esconde.
- **Línea de lectura automática** debajo del gráfico de Economía, sobre fondo
  dorado suave. Las reglas están escritas en `METRICAS.md`: una frase que el
  tablero afirma tiene que ser tan auditable como un número.
- **El selector de país arranca en Total** y recuerda la última elección entre
  visitas.
- **Los selectores de país y rango abren la pantalla**, en su propia fila
  debajo de las pestañas y alineados a la izquierda. La fecha de
  sincronización es un estado, no un control: va sola en el margen superior
  derecho, en gris chico.

---

## Tipografía

- Una sola familia. Sans, con buenos números.
- Como mucho tres tamaños por pantalla: cifra, etiqueta, texto secundario.
- Pesos: regular y medium. Nada de bold en todos lados — si todo pesa, nada
  pesa.
- Las etiquetas de métrica en gris, no en negro. La cifra manda.

---

## Qué no hacer

- Tarjetas con borde, sombra y fondo todas juntas. Elegir una.
- Animaciones de entrada, contadores que suben, transiciones llamativas.
- Barras de progreso circulares o medidores tipo velocímetro.
- Más de un gráfico por pregunta.
- Leyendas que repiten lo que ya dice el eje.
- Tooltips que contienen información que debería estar visible.
- Modo oscuro decorativo. Si se hace, que sea completo y legible, o nada.

---

## Ads

**El gasto vive en el día**, por país y plataforma, y se edita desde acá:
"Editar gasto" abre la carga, se elige plataforma y país, y se cargan los
montos diarios. Todo lo demás se suma al leer, así que corregir un día cambia
todos los números que dependen de él sin recalcular nada.

Arriba, **rango de fechas libre** y el selector de país. Cuatro métricas hero,
todas respetando los filtros:

| Hero | Qué muestra | Debajo |
|---|---|---|
| Gasto diario | Promedio del período | Total del período |
| Pacientes diarios | Promedio del período | Total del período |
| CAC | Gasto ÷ pacientes nuevos | Delta contra el período anterior, del mismo largo |
| Retorno diario | Margen generado − gasto | Total del período |

**Retorno es margen, nunca facturación**: sesiones realizadas × margen por
sesión, con 26% en AR y 30% en UY. Y **pacientes cuenta a todos los del
período**, no solo a los que trajeron las plataformas, para que el denominador
del CAC sea el mismo que en General.

**Tabla de dos niveles**: Meta, Instagram, Google Ads y TikTok, cada una
desplegable con sus `utm_source` crudos debajo. Cada campaña lleva una
**descripción escrita a mano** — `metaarj7` no dice nada solo.

Columnas: campaña, ventas de las últimas 6 semanas como mini-gráfico,
registros, ventas, conversión, CAC, ROAS y estado, con **la lectura de la fila
debajo**.

- **El CAC de la fila de plataforma es exacto** en Google Ads y TikTok: su
  gasto sobre sus ventas. **El de campaña es repartido** — el presupuesto de la
  plataforma dividido según su parte de los registros, porque nadie registra
  gasto por campaña — y lleva un `~` discreto que lo dice.
- **Instagram no tiene presupuesto propio.** El de Meta compra las pauta y el
  alcance orgánico que viene atrás, así que son **una sola unidad de
  inversión**: los registros de Instagram entran al reparto y su fila dice que
  el gasto es de Meta.

| Estado | Condición |
|---|---|
| Escalar | ROAS > 1,8 |
| Mantener | 1,3 – 1,8 |
| Bajar | < 1,3 |
| Apagar | Bajo 1,0 tres semanas seguidas |
| Sin dato | Menos de 30 registros — dice cuántos faltan, nunca un veredicto |

**El ROAS semanal se construye igual que el del período** — mismo pool, mismo
reparto — así que "tres semanas bajo 1" significa semana a semana lo mismo que
en el rango. Una semana sin gasto **no es un retorno de cero**: es que no hay
ratio, y no cuenta para apagar.

**La lectura de cada fila cita su propio número**: cuánto por encima o por
debajo del umbral, cuánto convierte contra el promedio de su plataforma,
cuántos registros faltan. Nunca una frase genérica.

**Solo plataformas con gasto o registros en el período.** Las apagadas van
detrás de un desplegable aparte.

## Funnel

**Una cohorte seguida hacia adelante, no totales mensuales apilados.** Todas
las etapas son la misma gente: los que se registraron en el mes. Cuántos de
*esos* compraron, cuántos hicieron la 1ª sesión, la 2ª, hasta la 10ª.

Antes no era así: Registros agrupaba por mes de registro y Compraron por mes de
venta, así que la caída entre las dos comparaba dos poblaciones distintas.

- **Barras horizontales proporcionales**, con la caída **entre** cada par, en
  absoluto y en porcentaje, en coral `#E5705A`.
- **Las primeras seis desplegadas**, el resto detrás de "ver todas". El cuello
  de botella está en los primeros saltos.
- **Un color por etapa**, de naranja a teal profundo. La transición marca el
  pasaje de adquisición a permanencia, así que el color dice en qué mitad del
  embudo está parada cada etapa sin leer la etiqueta.

```
Registros #E8833F   Compraron #F0A05C   1ª #F5D28B
2ª #7FBFBF   3ª #4A9B9B   4ª #3F8A8A   5ª #3A7D7D
6ª #357070   7ª #2F6565   8ª #2C5F5F   9ª #285555   10ª #244B4B
```

- **Lo que todavía no pasó va vacío, nunca en cero ni con una frase.** Barra
  punteada y el número en blanco. Una cohorte de dos meses no llegó a la 10ª
  sesión; decir "0" sería decir que nadie volvió.
- Cuatro cards: mediana de compra con su p80 abajo, compran en 24 h, no-show,
  caída 1ª→2ª.

**Grilla de caída por cohorte.** Filas las últimas 6 cohortes, columnas los
pasos entre sesiones (1→2 … 9→10), la intensidad es la caída, celdas punteadas
donde todavía no pasó el tiempo, y una columna `n` al final con el tamaño de la
cohorte. La escala satura en 60%: más arriba todo quedaría del mismo bloque y
la grilla dejaría de ordenar nada.

Debajo, una línea que lee la grilla: cuál es el paso más caro y si viene
mejorando entre cohortes. Con menos de seis cohortes con dato no opina sobre la
tendencia.

## Test

Antes de dar una pantalla por terminada:

1. ¿Se responde la pregunta principal sin scrollear?
2. ¿Se distingue en un segundo qué dato es provisorio?
3. ¿Alineando las columnas de números, quedan los dígitos alineados?
4. ¿Hay algún color que no signifique nada?
5. ¿Se puede sacar algún elemento sin perder información?

Si la respuesta a la 5 es sí, sacarlo.

## Mascotas del header

Cuatro personajes apoyados sobre la línea divisoria de la barra de pestañas,
empujados a la derecha. Son decoración y nada más: `aria-hidden`, sin texto
alternativo, sin animaciones, y se esconden por debajo de 1100px para que
nunca empujen la navegación.

Uno por franja del día, siempre en el mismo orden: noche, mañana, tarde,
creando. **Las cuatro al mismo peso y a opacidad plena.** Estuvieron al 35% con
la de la franja actual prendida: así el dibujo se leía como un estado —algo que
hay que mirar— en lugar de un dibujo apoyado en una línea. Son cuatro personas
distintas —tres nenas y un nene— y no se reordenan.

Cada franja tiene tres poses. Cuál se ve sale del día del mes módulo 3: estable
al recargar, distinta mañana, y la misma para las cuatro así cambian juntas.
Día local (UTC−3). La hora ya no interviene en nada.

Los doce PNG viven en `public/mascots/`, recortados a su tinta y escalados con
un factor común: la pose de pie más alta mide **64px** (`ALTO_MAXIMO`, el único
número a tocar si hay que agrandarlos otra vez) y la que duerme mide, en
proporción, los 39 que le corresponden. Darles la misma altura a todas la agrandaría al doble
del resto. Cada `<img>` lleva su ancho y alto escritos para que el navegador
tenga la caja antes de que llegue la imagen.

El trazo es azul marino, hecho para el fondo crema. En oscuro se pierde, así
que la clase `.mascota` lo invierte y gira el tono 180° —queda crema y el
naranja sigue siendo naranja— y en claro no se toca.

## Ancho y ritmo

**1400px centrados para toda la app**, con la clase `.contenedor`. Antes cada
pantalla elegía el suyo —1152 en General y Ads, 1024 en Funnel y Admin— y el
header no coincidía con el contenido de abajo.

Las cards de métrica van compactas: `px-3 py-2.5`, la cifra en `text-xl`, y el
texto de tendencia en **una sola línea** ("vs. mismos 16 días de ago"). Dos
líneas de explicación debajo de un número hacían la card más alta que el
número que justifica.

El gráfico mensual mide **260px de alto fijo** y sus barras ocupan el **60% del
espacio de cada mes**. Con un tercio, cada mes reservaba espacio que la barra
no usaba y doce barras finas en una pantalla ancha se leían como puntos
sueltos.

El viewBox del gráfico es 1352×260, que es lo que deja el contenedor de 1400
adentro de su padding: al ancho de diseño va 1:1, y más angosto escala para
adentro de la caja en lugar de estirarse, así las etiquetas nunca se deforman.

## El título del header

**Fraunces 600**, cargada con `next/font` y un solo peso: es la única línea de
la app que la usa, y pedir el rango variable completo serían varias veces los
bytes para un renglón.

Es la tipografía display y el cuerpo sigue en la sans del sistema. El contraste
entre las dos es lo que hace que el título deje de leerse como una etiqueta
más. Fraunces tiene remates suaves y algo excéntricos: conversa con los
monigotes dibujados a mano y con el fondo crema, que es justo lo que una
geométrica no haría.

"Tu Terapia" en el color de texto, el "·" en gris tenue, "Marketing Dash" en
naranja. 28px, sin `letter-spacing` y sin mayúsculas — el carácter lo pone la
tipografía, no el tratamiento.

## Panel de composición

A la derecha del gráfico mensual, en una card de fondo blanco sobre el crema y
alineada arriba con el gráfico. 420px fijos; el gráfico se queda con el resto.

Encabezado con el mes y el total, y debajo la lista ordenada de mayor a menor:
nombre, cantidad, porcentaje y barra de proporción. **Reemplaza la leyenda de
colores** que estaba abajo de las barras: mismos colores, mismo orden, y además
los números que la leyenda nunca dio. La leyenda sigue existiendo donde no hay
panel — Economía, que no apila.

Lee las mismas `series` que dibuja el gráfico, así que sigue sola a la métrica
elegida y al selector de país: desglosa **lo que el gráfico apila**. Con un país
elegido eso son plataformas; en TOTAL son países, porque es por país que apilan
las barras.

Por defecto muestra el **mes en curso**, con "· en curso" al lado del nombre
para que se lea que es medio mes: es el mes sobre el que se está trabajando, que
es a lo que uno viene. Pasando el mouse por una barra sigue ese mes; al salir
vuelve.

Menos del 2% se agrupa en "otras", y también la cola que sobre después de cinco
filas nombradas. Once plataformas donde siete redondean a cero vuelven a ser una
leyenda, no una lectura.
