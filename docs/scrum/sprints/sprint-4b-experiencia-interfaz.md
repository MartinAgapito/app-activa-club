# Sprint 4B — Experiencia e interfaz (propuesto)

| Campo             | Valor                                                           |
| ----------------- | --------------------------------------------------------------- |
| Sprint            | 4B                                                              |
| Nombre            | Experiencia e interfaz                                          |
| Épica             | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md)        |
| Fase              | MVP (propuesta, pendiente de aprobación del Product Owner)      |
| Duración sugerida | 2 semanas                                                       |
| Estado            | Propuesto                                                       |
| Posición          | A decidir por el Product Owner (ver "Dónde ubicar este sprint") |

## Sprint Goal

Que **entrar a Activa Club se sienta como usar una aplicación y no un prototipo**: el socio y el administrador llegan a un inicio que les dice qué está pasando y qué hacer; reservar es un asistente de cuatro pasos en una ventana; y revisar, aprobar, rechazar, cancelar, editar y bloquear se hace en paneles y ventanas, sin desplazarse por páginas largas. Todo sobre los endpoints que ya existen.

## Origen

Reclamo directo del dueño del producto tras la primera prueba extremo a extremo en `dev` (ver [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md), "Origen"): inicio vacío, estilos básicos, CRUD sin ventanas y flujos que obligan a desplazarse.

## Alcance del sprint

Las dieciocho historias de EP-08 (US-061..US-078), en tres bloques:

- **A — Base de diseño** (20 puntos): tokens, ventana, panel lateral, pestañas, tabla, avisos efímeros, indicador de pasos, estructura por rol y verificación de accesibilidad.
- **B — Inicio útil** (6 puntos): inicio del socio e inicio del administrador con endpoints existentes.
- **C — Flujos rehechos** (21 puntos): asistente de reserva, catálogo de instalaciones, Mis reservas y los cuatro CRUD del administrador.

**Solo frontend** (`apps/web`, `packages/ui`). Ningún cambio en `apps/api`, en `docs/api/contratos-api.md` ni en `infrastructure/terraform/`. No hay despliegue de backend ni `terraform apply` en este sprint.

**Fuera de este sprint:**

- Todo lo que requiere backend (totales exactos del administrador, `canReserve` del servidor, avisos recientes, nombres de socios participantes): ver la tabla de EP-08.
- Modo oscuro, rediseño de la página pública y de las pantallas de acceso (preguntas abiertas 3 y 8 de EP-08).
- Las pantallas de EP-05, EP-06 y EP-07, que se construirán **con** estos componentes en sus propios sprints.

## Sprint Backlog

| ID                                                                               | Título                                                                   | Bloque | Prioridad | Depende de                             | Estimación |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | --------- | -------------------------------------- | ---------- |
| [US-061](../historias/US-061-ampliar-tokens-diseno.md)                           | Ampliar los tokens de diseño (superficies, tipografía, capas y estados)  | A      | Crítica   | —                                      | 2          |
| [US-062](../historias/US-062-componente-modal-accesible.md)                      | Componente de ventana modal accesible                                    | A      | Crítica   | US-061                                 | 3          |
| [US-063](../historias/US-063-componente-drawer-panel-lateral.md)                 | Componente de panel lateral (drawer)                                     | A      | Alta      | US-062                                 | 2          |
| [US-064](../historias/US-064-componente-tabs.md)                                 | Componente de pestañas                                                   | A      | Alta      | US-061                                 | 2          |
| [US-065](../historias/US-065-componente-tabla-datos-responsive.md)               | Componente de tabla de datos responsive                                  | A      | Alta      | US-061                                 | 3          |
| [US-066](../historias/US-066-componente-toast-avisos-efimeros.md)                | Componente de avisos efímeros (toast)                                    | A      | Alta      | US-061                                 | 2          |
| [US-067](../historias/US-067-componente-stepper.md)                              | Componente indicador de pasos (stepper)                                  | A      | Alta      | US-061                                 | 1          |
| [US-068](../historias/US-068-estructura-aplicacion-por-rol.md)                   | Navegar con barra lateral y cabecera según mi rol                        | A      | Alta      | US-061, US-063                         | 3          |
| [US-069](../historias/US-069-catalogo-componentes-verificacion-accesibilidad.md) | Catálogo de componentes y verificación automática de accesibilidad       | A      | Media     | US-062..US-067                         | 2          |
| [US-070](../historias/US-070-inicio-socio-datos-existentes.md)                   | Ver mi situación y mi próxima reserva al entrar (inicio del socio)       | B      | Alta      | US-068                                 | 3          |
| [US-071](../historias/US-071-inicio-admin-pendientes.md)                         | Ver lo que requiere mi atención al entrar (inicio del administrador)     | B      | Alta      | US-065, US-068                         | 3          |
| [US-072](../historias/US-072-asistente-reserva-en-ventana.md)                    | Reservar una instalación con un asistente por pasos en ventana           | C      | Crítica   | US-062, US-066, US-067                 | 5          |
| [US-073](../historias/US-073-catalogo-instalaciones-entrada-asistente.md)        | Elegir la instalación desde un catálogo visual que abre el asistente     | C      | Media     | US-072                                 | 2          |
| [US-074](../historias/US-074-mis-reservas-panel-detalle.md)                      | Consultar mis reservas en pestañas con panel de detalle y cancelación    | C      | Alta      | US-062, US-063, US-064, US-065, US-066 | 3          |
| [US-075](../historias/US-075-admin-editar-recurso-modal.md)                      | Editar una instalación desde una ventana                                 | C      | Media     | US-062, US-064, US-065, US-066         | 3          |
| [US-076](../historias/US-076-admin-bloqueos-mantenimiento-modal.md)              | Crear y liberar bloqueos de mantenimiento desde ventanas                 | C      | Media     | US-062, US-064, US-065, US-066         | 3          |
| [US-077](../historias/US-077-admin-reservas-pestanas-detalle-decision.md)        | Revisar y decidir reservas desde pestañas, panel de detalle y ventanas   | C      | Alta      | US-062..US-066                         | 3          |
| [US-078](../historias/US-078-admin-solicitudes-socios-panel-decision.md)         | Revisar y decidir solicitudes de socios desde panel de detalle y ventana | C      | Media     | US-062, US-063, US-065, US-066         | 2          |

Estimación total: **47 puntos relativos** (A: 20, B: 6, C: 21). Velocidad observada: 45 (Sprint 1), 42 (Sprint 2) y 57 planificados en el Sprint 3, cerrado en dos tramos. Está en el límite superior: por eso el orden de sacrificio es explícito.

**Orden de sacrificio si la velocidad no alcanza:** US-069 (catálogo y accesibilidad automática), luego US-078 (solicitudes, ya es la pantalla administrativa más ordenada), luego US-076 y US-075 (recursos y mantenimiento), luego US-073 (catálogo visual; el asistente sigue abriéndose desde "Nueva reserva"). **Innegociables:** el bloque A sin US-069 (US-061..US-068), los dos inicios (US-070, US-071), el asistente de reserva (US-072), Mis reservas (US-074) y la decisión de reservas del administrador (US-077): son exactamente lo que el dueño del producto reclamó y lo que se ve en la demostración. Ese núcleo suma **34 puntos**.

## Grafo de dependencias

```
US-061 ──┬──► US-062 ──► US-063 ──► US-068 ──┬──► US-070
         ├──► US-064                         └──► US-071 ◄── US-065
         ├──► US-065
         ├──► US-066
         └──► US-067
US-062..US-067 ──► US-069

US-062, US-066, US-067 ──────────────► US-072 ──► US-073
US-062, US-063, US-064, US-065, US-066 ──► US-074, US-077
US-062, US-064, US-065, US-066 ──────► US-075, US-076
US-062, US-063, US-065, US-066 ──────► US-078
```

El bloque A bloquea a B y C. B y C no se bloquean entre sí.

## Orden sugerido de ejecución (olas)

- **Ola 0 (Planning, día 1):** el Product Owner resuelve la dirección visual (pregunta 1 de EP-08), las imágenes de instalaciones (5) y la posición del sprint (9). El Arquitecto decide componentes propios o primitivas accesibles de una librería (pregunta 2) e iconografía (4), y lo registra en un ADR **antes** de la Ola 2: es la decisión que más cambia las estimaciones del bloque A.
- **Ola 1:** US-061 (tokens). Es corta y desbloquea todo lo demás. En paralelo, QA prepara el guion de verificación manual de los casos UX-01..UX-14 y los datos de prueba en `dev` (un socio al día, uno con deuda, una parrilla pendiente, una reserva a menos de 24 horas).
- **Ola 2 (en paralelo):** US-062 (ventana), US-064 (pestañas), US-065 (tabla), US-066 (avisos efímeros), US-067 (indicador de pasos). Son componentes independientes en archivos distintos de `packages/ui`.
- **Ola 3:** US-063 (panel lateral, sobre la ventana) y en seguida US-068 (estructura por rol). En paralelo, **US-072** (asistente de reserva), que solo necesita ventana, avisos e indicador de pasos y es la historia más grande: conviene empezarla cuanto antes. US-069 al cierre de la ola.
- **Ola 4 (en paralelo):** bloque B — US-070 y US-071; bloque C — US-073, US-074, US-075, US-076, US-077, US-078. Cada una toca una pantalla distinta.
- **Ola 5 (verificación):** en `dev`, recorrido de los casos UX-01..UX-14 en 375 px y 1280 px, solo con teclado en los flujos de ventana, y ensayo de la demostración: entrar como socio → inicio → "Nueva reserva" → asistente → aviso → Mis reservas → cancelar; entrar como administrador → inicio → reserva pendiente → panel → rechazar con motivo → aviso.

## Capacidad de trabajo paralelo

- Ninguna historia toca backend ni infraestructura: no hay espera por despliegues, permisos ni redespliegue del stage.
- Los componentes del bloque A son independientes entre sí salvo el panel lateral (sobre la ventana): cinco pueden construirse a la vez.
- Las historias del bloque C reorganizan pantallas existentes con pruebas existentes (`ReservationsPage.test.tsx`, `MyReservationsPage.test.tsx`, `ReservationsAdminPage.test.tsx`, `ResourcesMaintenancePage.test.tsx`, `PendingRequestsPage.test.tsx`): esas pruebas son la red de seguridad contra regresiones funcionales.
- Un PR por historia, como en los sprints anteriores.

## Dónde ubicar este sprint (decide el Product Owner)

Estado actual: el Sprint 4 (notificaciones) arrancó su Ola 1 con US-038 implementada; el resto (US-039..US-049) está sin empezar. El Sprint 5 (administración y dashboards) está planificado.

**Opción recomendada — A: ejecutar el Sprint 4B ahora, antes de continuar con la Ola 2 del Sprint 4.**

- Es un reclamo directo del dueño del producto tras la primera prueba real; dejarlo dos sprints sin respuesta es el mayor riesgo para la demostración de la tesis.
- Evita retrabajo: los Sprints 4 y 5 construyen **ocho pantallas nuevas** (US-041 bandeja, US-049 consola de avisos, US-050, US-051, US-053, US-056, US-059, US-060). Si llegan antes que la base de diseño, se construyen con el patrón actual y se rehacen después; si llegan después, se construyen directamente con tabla, pestañas, panel y ventana.
- No interfiere con lo ya hecho del Sprint 4: US-038 es backend y queda desplegada; el 4B no toca `apps/api` ni Terraform.
- Costo: el Sprint 4 y el Sprint 5 se desplazan dos semanas en el calendario.

**Opción B — en paralelo con el Sprint 4.** Viable si hay capacidad de frontend separada de backend: diez de las doce historias del Sprint 4 son solo de backend. Riesgo: con una sola persona de desarrollo el paralelo es ficticio y las dos líneas avanzan a medias. Condición: las pantallas de US-041 y US-049 no empiezan hasta tener el bloque A.

**Opción C — después del Sprint 4 (no recomendada).** El reclamo queda abierto dos semanas más y las dos pantallas del Sprint 4 se construyen con el patrón viejo y se rehacen.

**Opción mínima, si el calendario de la tesis no admite dos semanas:** ejecutar solo el núcleo innegociable (34 puntos) como 4B corto y llevar US-069, US-073, US-075, US-076 y US-078 al final del Sprint 5, que tiene margen deliberado (39 puntos).

Este documento **no reordena** los Sprints 4 y 5: solo propone. Tras la decisión del Product Owner se actualizan el estado de este sprint, los índices y, si corresponde, las fechas de los Sprints 4 y 5.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- `/socio` y `/admin` muestran información real; ninguna pantalla del MVP dice "en construcción" salvo las que pertenecen a sprints futuros (notificaciones, socios, pagos del administrador, analítica).
- Reservar, cancelar una reserva, editar una instalación, crear o liberar un bloqueo, decidir una reserva y decidir una solicitud de socio se completan sin salir de la pantalla en la que se inician.
- Los casos UX-01..UX-14 (propuestos en EP-08 e incorporados por QA a la matriz de trazabilidad en la Ola 1) pasan.
- Todas las pruebas existentes de las pantallas reorganizadas siguen pasando (adaptadas, sin perder casos).
- No hay cambios en `apps/api`, en el contrato de API ni en `infrastructure/terraform/`.

## Ceremonias

- **Planning:** resolución de las preguntas abiertas 1, 2, 4, 5 y 9 de EP-08; confirmación del Sprint Goal y del núcleo innegociable.
- **Daily:** foco en cerrar el bloque A rápido; nadie empieza una pantalla del bloque C con componentes provisionales.
- **Review:** el dueño del producto repite la misma prueba extremo a extremo que originó el reclamo, en `dev`, en celular y en escritorio.
- **Retrospective:** ¿la base de diseño debió priorizarse en el Sprint 0/1 junto con US-008? Lección para la estimación de interfaces en la tesis.

## Riesgos del sprint

- **Accesibilidad de ventanas y paneles construida a mano** (foco atrapado, Escape, devolución del foco). Impacto alto: defectos difíciles de ver y que el jurado puede probar con teclado. Mitigación: pregunta abierta 2 (primitivas accesibles probadas); casos UX-01/UX-02; US-069.
- **Regresión funcional al reorganizar pantallas ya probadas** (reserva, cancelación, aprobación). Impacto alto: romper lo que ya funcionaba en la prueba extremo a extremo. Mitigación: las pruebas existentes se adaptan sin eliminar casos; el servidor sigue validando todo; criterio explícito en cada historia del bloque C.
- **Estimación del bloque A** (componentes base suelen crecer). Impacto medio. Mitigación: decisión de la pregunta 2 en la Planning; orden de sacrificio; el núcleo innegociable cabe en 34 puntos.
- **Discusión subjetiva sobre "se ve bien"**. Impacto medio: el sprint no termina nunca. Mitigación: la dirección visual se decide en la Ola 0 y los criterios son verificables (contraste, 375 px, teclado, sin salir de la ventana), no de gusto.
- **Inicios que muestran cifras parciales** (primera página de pendientes). Impacto bajo-medio: confusión del administrador. Mitigación: US-071 criterio 1 ("5 o más", nunca un total inventado); US-059 trae los totales exactos.
- **Desplazar el Sprint 4** (opción A). Impacto medio en el calendario de la tesis. Mitigación: opción mínima de 34 puntos; el Sprint 5 tiene margen.
- **Sin pruebas extremo a extremo automatizadas** (no hay Playwright en el repositorio). Impacto medio: los casos de pantalla completa dependen de verificación manual. Mitigación: guion manual de QA en la Ola 1 y pregunta abierta 7 de EP-08.

## Historial de cambios

- 2026-10-11: Propuesta del Sprint 4B con las historias de EP-08 (US-061..US-078) tras el reclamo del dueño del producto en la primera prueba extremo a extremo en `dev`. Pendiente de decisión del Product Owner sobre su posición respecto del Sprint 4.
