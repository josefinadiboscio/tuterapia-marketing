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

## Color

**El color solo comunica significado. Nunca decora.**

| Uso | Color |
|---|---|
| Delta positivo | verde |
| Delta negativo | rojo |
| Alerta / red flag | ámbar o rojo |
| Provisorio / proyectado | atenuado, gris |
| Todo lo demás | neutro |

- Un solo acento, y usado poco.
- Nada de gradientes, glassmorphism, sombras de colores ni fondos decorativos.
- Las series de un gráfico usan una rampa del mismo color, no colores
  distintos, salvo que representen categorías realmente distintas.
- **El color nunca es el único portador de información.** Un delta rojo lleva
  también una flecha o un signo.

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

Estos tienen que leerse de un vistazo, porque son los que evitan decisiones
equivocadas:

- **Mes en curso:** atenuado, sin delta, con la leyenda de que está en curso.
- **Cohorte proyectada:** el número con una marca clara de proyección y la edad
  de la cohorte al lado.
- **Sin datos suficientes:** no mostrar un número bajo. Mostrar cuánto falta
  ("faltan 138 registros").
- **Vacío:** decir qué hacer para llenarlo, no mostrar un cero.
- **Carga:** skeleton con la forma del contenido, no un spinner centrado.

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
