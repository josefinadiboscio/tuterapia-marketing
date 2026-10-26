-- Cuántos de los registros de un mes llegaron a elegir terapeuta.
--
-- El paso que faltaba del embudo. La pestaña Funnel arranca en la compra, así
-- que entre "se registró" y "compró" no había nada en pantalla, y ahí está el
-- corte más grande: de los registros de julio a hoy, los que NO tienen
-- terapeuta compraron 1 vez sobre 8.355. Con terapeuta, 2.725 sobre 19.460.
-- Elegir terapeuta no es un dato de perfil, es la puerta.
--
-- Se guarda el numerador y nada más: el denominador es `registros`, que ya
-- está en esta misma fila. Dos columnas que tienen que sumar entre sí es una
-- forma de que algún día no sumen.
--
-- `pacientes.id_terapeuta` no tiene fecha propia —`modificacion` se mueve con
-- cualquier edición de la fila— así que esto es un ESTADO DE HOY y no un
-- evento con un cuándo. Eso tiene dos consecuencias y las dos importan:
--
--   · El mes en curso no es comparable con los cerrados. Una cohorte tarda
--     tres o cuatro semanas en terminar de elegir: a cuatro días de
--     registrarse va en 15–22%, a tres semanas en 42–48%, y los meses
--     cerrados quedan planos en 73–82%. Octubre a mitad de camino marca 45%
--     en AR y no es una caída, es una cohorte sin terminar. La pantalla lo
--     dice con la edad al lado, como las cohortes proyectadas del funnel.
--
--   · Un mes cerrado queda congelado con el valor que tenía cuando el cron
--     dejó de escribirlo, y eso está bien acá: medido sobre trece cohortes, el
--     valor no se mueve después del primer mes —marzo (siete meses) marca
--     75,6% y septiembre (uno) 76,7%— así que no hay un arrastre que el cron
--     se esté perdiendo.
alter table marketing.metricas_mensuales
  add column if not exists eligieron_terapeuta int;

comment on column marketing.metricas_mensuales.eligieron_terapeuta is
  'Registros del mes que HOY tienen pacientes.id_terapeuta asignado. Estado, no evento: la columna de origen no tiene fecha. La cohorte se estabiliza a las 3–4 semanas, así que un mes con cohorte_edad_dias < 30 está sin terminar.';
