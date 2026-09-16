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

La rampa de marca sale del logo:

```
--brand-50:  #F2FAF3      --brand-400: #75B781   ← principal
--brand-100: #CEE6D3      --brand-600: #4A8757
--brand-200: #A5D0AD      --brand-800: #2C5636
--brand-300: #95DB9F      --brand-900: #1B3722
```

- **Fondo claro en crema** (`#FAF7F0`), no blanco. Las superficies de card van
  un punto más claras que el fondo.
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

- Un solo acento, y usado poco.
- Nada de gradientes, glassmorphism, sombras de colores ni fondos decorativos.
- Las series de un gráfico usan **stops de la rampa de marca**, no colores
  distintos.
- **El color nunca es el único portador de información.** Como los deltas no
  llevan color, la dirección la dan la palabra y la flecha.

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

- **En curso:** atenuado, con la palabra al lado y el motivo en el tooltip.
- **Sin datos suficientes:** no mostrar un número bajo. Mostrar cuánto falta
  ("faltan 138 registros").
- **Vacío:** decir qué hacer para llenarlo, no mostrar un cero.
- **Carga:** skeleton con la forma del contenido, no un spinner centrado.

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

- **Bloque Volumen:** Conversión, Registros, Pacientes nuevos, Pacientes
  activos. Gráfico de barras.
- **Bloque Economía:** CAC, Costo por registro, LTV. Gráfico de línea.
- **Las cards son el selector.** Al clickear una, el gráfico de abajo muestra
  esa serie. Un gráfico por bloque, nunca dos.
- **Selector de rango 6m / 12m / 24m** arriba, junto al de país.
- **Anotaciones según la serie.** Con CAC seleccionado el gráfico dibuja el LTV
  como techo: mientras la línea esté abajo, cada paciente devuelve más de lo
  que costó. Con las demás series no hay banda.
- **Línea de lectura automática** al pie, que interpreta las pendientes. Las
  reglas están escritas en `METRICAS.md`: una frase que el tablero afirma tiene
  que ser tan auditable como un número.

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
