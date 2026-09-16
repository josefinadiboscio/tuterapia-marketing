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
color.** Cambiar el tema es editar `app/globals.css` y nada más; si para
cambiar un color hay que abrir una pantalla, el sistema está roto.

La paleta sale del sitio:

```
--cream:      #FDFAF6   fondo
--surface:    #FFFFFF   cards
--sage:       #84B686   volumen
--sage-light: #A6C69F
--forest:     #2D4435   texto fuerte, estados positivos
--teal:       #397B7B   economía
--teal-deep:  #285F5F
--navy:       #1B2549   tinta de los números
--gold:       #F5D28B   avisos
--coral:      #E59A88   series secundarias, alertas suaves
--muted:      #617869   etiquetas
--border:     #D6D6CF
```

- **Fondo crema**, cards en blanco: las superficies son más claras que el
  fondo, no más oscuras.
- **Los números van en navy, no en gris.** Si la cifra pesa lo mismo que su
  etiqueta, la pantalla se lee lavada y no hay jerarquía que valga.
- **Las etiquetas van en `--muted`.** La cifra manda.
- **Modo oscuro completo**, con toggle, respetando `prefers-color-scheme` por
  defecto. Una elección explícita gana sobre la del sistema y se recuerda.
- **En oscuro el acento pasa a `--brand-300`.** `--brand-400` no llega al
  contraste sobre fondo oscuro.
- Los tokens de gráfico (`--chart-fill`, `--chart-line`, `--chart-band`)
  apuntan a stops distintos según el tema, así que los gráficos se adaptan sin
  que ningún componente sepa qué tema está activo.

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
| Registros | `--sage` |
| Pacientes nuevos | `--forest` |
| Pacientes activos | `--teal` |
| Conversión | `--gold` |
| CAC | `--teal-deep` |
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
va atenuado y dice "en curso".** Nada más. Se eliminan de la UI las etiquetas
"provisorio", "cohorte inmadura" y "proyectado": son tres nombres para la misma
idea, y obligan a quien mira a aprender un vocabulario para leer un número.

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

**La tendencia va en palabras, no como delta contra el mes anterior:**
"creciendo · +31% en 6m", "estable · +4% en 6m", "bajando · −1,8 pp en 6m". Un
mes contra el anterior dice qué pasó una vez; una pendiente sobre seis meses
cerrados dice hacia dónde va la cosa, que es la pregunta con la que se abre el
tablero.

## General

Se organiza alrededor de **series temporales**, no de cards con deltas.

- **Bloque Volumen**, en la familia verde: Registros, Pacientes nuevos,
  Pacientes activos, Conversión — en ese orden. Registros primero porque es la
  entrada del embudo; conversión última porque es la que resume a las otras.
  Gráfico de barras.
- **Bloque Economía**, en la familia teal: CAC, Costo por registro, LTV.
  Gráfico de línea, y **la lectura automática va acá abajo**, sobre fondo
  dorado suave — no al pie de la pantalla.
- **Las cards son el selector.** Al clickear una, el gráfico de abajo muestra
  esa serie. Un gráfico por bloque, nunca dos.
- **Selector de rango 6m / 12m / 24m** arriba, junto al de país.
- **Anotaciones según la serie.** Con CAC seleccionado el gráfico dibuja el LTV
  como techo: mientras la línea esté abajo, cada paciente devuelve más de lo
  que costó. Con las demás series no hay banda.
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

## Test

Antes de dar una pantalla por terminada:

1. ¿Se responde la pregunta principal sin scrollear?
2. ¿Se distingue en un segundo qué dato es provisorio?
3. ¿Alineando las columnas de números, quedan los dígitos alineados?
4. ¿Hay algún color que no signifique nada?
5. ¿Se puede sacar algún elemento sin perder información?

Si la respuesta a la 5 es sí, sacarlo.
