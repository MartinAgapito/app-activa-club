# EP-08 — Experiencia de usuario e interfaz

| Campo            | Valor                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| ID               | EP-08                                                                                          |
| Tipo             | Épica transversal                                                                              |
| Fase             | MVP (propuesta, pendiente de aprobación del Product Owner)                                     |
| Estado           | Propuesta                                                                                      |
| Dependencias     | EP-02, EP-03, EP-04 (pantallas ya entregadas sobre endpoints ya desplegados)                   |
| Sprint principal | [Sprint 4B — Experiencia e interfaz](../sprints/sprint-4b-experiencia-interfaz.md) (propuesto) |

## Origen

Tras la primera prueba extremo a extremo en `dev`, el dueño del producto reportó (cita textual): _"no ve nada en el home, el diseño de la web está muy básico en estilos, las reservas o CRUDs son bien básicos, por qué no abren modales, solo tengo que scrollear y no es muy intuitivo; tenemos que mejorar eso"_.

Diagnóstico verificado en el código (2026-10-11):

- `/socio` (`MemberDashboardPage`) y `/admin` (`AdminDashboardPage`) son placeholders de once líneas (`UnderConstructionPage`): el socio y el administrador entran a una pantalla que dice "en construcción".
- `packages/ui` solo ofrece `Badge`, `Button`, `Card`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `Input`, `PageLayout`, `Spinner` y `Textarea`. No hay ventana modal general, panel lateral, pestañas, tabla, avisos efímeros ni indicador de pasos.
- `ConfirmDialog`, el único diálogo existente, no atrapa el foco (Tab sale del diálogo), no devuelve el foco al control que lo abrió y usa identificadores fijos (`confirm-dialog-title`), que se repiten si hay dos en la misma página.
- `/socio/reservas` (`ReservationsPage.tsx`, 545 líneas) resuelve catálogo, disponibilidad, participantes y resumen en una sola columna que se recorre con scroll.
- `/admin/recursos` apila la gestión de recursos (formulario de edición en línea) y los bloqueos de mantenimiento (formulario fijo arriba); `/admin/reservas` apila la bandeja de pendientes y el listado general.
- La navegación de socio y administrador es una fila de enlaces que en móvil se desplaza horizontalmente; no hay cabecera con el nombre del usuario ni menú lateral.
- Sí existen tokens de color y tipografía (`apps/web/src/styles/theme.css`, documentados en `apps/web/docs/design-foundation.md`, US-008), que esta épica amplía en lugar de reemplazar.

## Descripción

Dar a la plataforma una experiencia de uso a la altura de una demostración de producto: una **base de diseño** reutilizable (tokens ampliados y componentes accesibles de ventana, panel lateral, pestañas, tabla, avisos efímeros e indicador de pasos), una **estructura de aplicación** por rol con barra lateral y cabecera, un **inicio útil** para el socio y para el administrador compuesto solo con datos que ya entrega el servidor, y los **flujos principales rehechos** con ventanas: reservar como asistente por pasos, consultar y cancelar reservas desde un panel de detalle, y los CRUD del administrador (recursos, mantenimiento, reservas, solicitudes de socios) con modales.

**Es trabajo exclusivamente de frontend** (`apps/web` y `packages/ui`) sobre endpoints ya desplegados y probados. No requiere cambios en `apps/api`, en los contratos de `docs/api/contratos-api.md` ni en Terraform. Las reglas de negocio no cambian: el servidor sigue siendo la fuente de verdad de cada validación.

## Por qué una épica propia y no dentro de EP-07

- **Es transversal**: toca pantallas de EP-02 (solicitudes de socios), EP-03 (membresía), EP-04 (reservas, recursos, mantenimiento) y la estructura común de la aplicación. Colgarla de EP-07 mezclaría trazabilidad de épicas distintas.
- **EP-07 depende de backend nuevo** (`GET /dashboard/member`, `GET /dashboard/admin`, US-054/US-055/US-057/US-058) y está planificada para el Sprint 5; esta épica no depende de ningún endpoint nuevo y puede empezar ya.
- **Separa el "cómo se ve y se usa" del "qué datos muestra"**: EP-07 define métricas y contratos; EP-08 define los componentes y patrones con los que EP-05, EP-06 y EP-07 construirán sus pantallas sin rehacerlas.

## Valor de negocio

- Responde a un reclamo directo del dueño del producto tras la primera prueba real.
- Es lo que el jurado de la tesis verá primero: una plataforma con inicio vacío y formularios apilados transmite "prototipo", aunque el servidor esté completo y probado.
- Reduce el costo de las épicas siguientes: ocho pantallas planificadas en los Sprints 4 y 5 (US-041, US-049, US-050, US-051, US-053, US-056, US-059, US-060) se construyen directamente con los componentes nuevos en lugar de rehacerse después.
- Mejora la accesibilidad real (teclado, lectores de pantalla), que hoy solo se cumple de forma parcial.

## Objetivos de la épica

- **Bloque A — Base de diseño:** tokens ampliados (US-061), componentes accesibles en `packages/ui` (US-062..US-067), estructura de aplicación por rol (US-068) y verificación automática de accesibilidad (US-069).
- **Bloque B — Inicio útil:** inicio del socio (US-070) e inicio del administrador (US-071) con datos de endpoints existentes, preparados para que EP-07 los enriquezca sin rehacerlos.
- **Bloque C — Flujos rehechos:** asistente de reserva en ventana (US-072, US-073), Mis reservas con panel de detalle (US-074) y CRUD del administrador con ventanas (US-075..US-078).

## Historias asociadas

| ID                                                                               | Título                                                                   | Bloque | Responsable | Depende de                             | Est. |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ----------- | -------------------------------------- | ---- |
| [US-061](../historias/US-061-ampliar-tokens-diseno.md)                           | Ampliar los tokens de diseño (superficies, tipografía, capas y estados)  | A      | Frontend    | —                                      | 2    |
| [US-062](../historias/US-062-componente-modal-accesible.md)                      | Componente de ventana modal accesible                                    | A      | Frontend    | US-061                                 | 3    |
| [US-063](../historias/US-063-componente-drawer-panel-lateral.md)                 | Componente de panel lateral (drawer)                                     | A      | Frontend    | US-062                                 | 2    |
| [US-064](../historias/US-064-componente-tabs.md)                                 | Componente de pestañas                                                   | A      | Frontend    | US-061                                 | 2    |
| [US-065](../historias/US-065-componente-tabla-datos-responsive.md)               | Componente de tabla de datos responsive                                  | A      | Frontend    | US-061                                 | 3    |
| [US-066](../historias/US-066-componente-toast-avisos-efimeros.md)                | Componente de avisos efímeros (toast)                                    | A      | Frontend    | US-061                                 | 2    |
| [US-067](../historias/US-067-componente-stepper.md)                              | Componente indicador de pasos (stepper)                                  | A      | Frontend    | US-061                                 | 1    |
| [US-068](../historias/US-068-estructura-aplicacion-por-rol.md)                   | Navegar con barra lateral y cabecera según mi rol                        | A      | Frontend    | US-061, US-063                         | 3    |
| [US-069](../historias/US-069-catalogo-componentes-verificacion-accesibilidad.md) | Catálogo de componentes y verificación automática de accesibilidad       | A      | Frontend    | US-062..US-067                         | 2    |
| [US-070](../historias/US-070-inicio-socio-datos-existentes.md)                   | Ver mi situación y mi próxima reserva al entrar (inicio del socio)       | B      | Frontend    | US-068                                 | 3    |
| [US-071](../historias/US-071-inicio-admin-pendientes.md)                         | Ver lo que requiere mi atención al entrar (inicio del administrador)     | B      | Frontend    | US-065, US-068                         | 3    |
| [US-072](../historias/US-072-asistente-reserva-en-ventana.md)                    | Reservar una instalación con un asistente por pasos en ventana           | C      | Frontend    | US-062, US-066, US-067                 | 5    |
| [US-073](../historias/US-073-catalogo-instalaciones-entrada-asistente.md)        | Elegir la instalación desde un catálogo visual que abre el asistente     | C      | Frontend    | US-072                                 | 2    |
| [US-074](../historias/US-074-mis-reservas-panel-detalle.md)                      | Consultar mis reservas en pestañas con panel de detalle y cancelación    | C      | Frontend    | US-062, US-063, US-064, US-065, US-066 | 3    |
| [US-075](../historias/US-075-admin-editar-recurso-modal.md)                      | Editar una instalación desde una ventana                                 | C      | Frontend    | US-062, US-064, US-065, US-066         | 3    |
| [US-076](../historias/US-076-admin-bloqueos-mantenimiento-modal.md)              | Crear y liberar bloqueos de mantenimiento desde ventanas                 | C      | Frontend    | US-062, US-064, US-065, US-066         | 3    |
| [US-077](../historias/US-077-admin-reservas-pestanas-detalle-decision.md)        | Revisar y decidir reservas desde pestañas, panel de detalle y ventanas   | C      | Frontend    | US-062..US-066                         | 3    |
| [US-078](../historias/US-078-admin-solicitudes-socios-panel-decision.md)         | Revisar y decidir solicitudes de socios desde panel de detalle y ventana | C      | Frontend    | US-062, US-063, US-065, US-066         | 2    |

Total: **47 puntos relativos** (A: 20, B: 6, C: 21).

## Orden de dependencias

```
US-061 (tokens) ──┬──► US-062 (modal) ──► US-063 (drawer) ──► US-068 (estructura por rol)
                  ├──► US-064 (tabs)                               │
                  ├──► US-065 (tabla)                              ├──► US-070 (inicio socio)
                  ├──► US-066 (toast)                              └──► US-071 (inicio admin) ◄── US-065
                  └──► US-067 (stepper)
US-062..US-067 ──► US-069 (catálogo + accesibilidad automática)

US-062 + US-066 + US-067 ──► US-072 (asistente de reserva) ──► US-073 (catálogo visual de instalaciones)
US-062 + US-063 + US-064 + US-065 + US-066 ──► US-074 (Mis reservas), US-077 (reservas admin)
US-062 + US-064 + US-065 + US-066 ──► US-075 (recursos), US-076 (mantenimiento)
US-062 + US-063 + US-065 + US-066 ──► US-078 (solicitudes de socios)
```

**El bloque A bloquea a B y C.** B y C no dependen entre sí, salvo el acceso "Nueva reserva" del inicio del socio, que abre el asistente cuando US-072 existe y, mientras tanto, lleva a `/socio/reservas`.

## Lo que esta épica NO requiere (y lo que sí requeriría backend)

Todo el bloque B se compone con endpoints existentes: `GET /members/me` (estado de membresía, `membershipEndsAt`, `outstandingBalance`), `GET /reservations?scope=me&from=` (próxima reserva), `GET /payments?limit=` (último pago), `GET /members?status=PENDING` (solicitudes pendientes) y `GET /reservations?scope=all&status=PENDING_APPROVAL` (reservas por aprobar). El bloque C usa los endpoints de §4, §6 y §7 del contrato que ya consumen las pantallas actuales.

Necesidades detectadas que **sí** requerirían backend y por eso **quedan fuera de EP-08**, asignadas a la historia que ya las cubre:

| Necesidad                                                       | Por qué requiere backend                                                   | Dónde se resuelve                            |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| Totales exactos de pendientes en el inicio del administrador    | Los listados son paginados y no devuelven un total                         | US-057 (`GET /dashboard/admin`)              |
| `canReserve` calculado en el servidor para el inicio del socio  | Hoy la interfaz solo anticipa el bloqueo con `GET /members/me`             | US-055 (`GET /dashboard/member`)             |
| Avisos recientes en el inicio del socio                         | `GET /notifications` no está implementado                                  | US-041 (EP-05)                               |
| Listar todas las reservas sin filtro de estado ni instalación   | `scope=all` exige `status` o `resourceId` (modelo de datos §4)             | No se pide; la interfaz siempre filtra       |
| Nombre de los socios participantes en el detalle de una reserva | `GET /reservations/{id}` solo devuelve su `memberId`                       | Historia de backend aparte, si el PO la pide |
| Ver los bloqueos de todas las instalaciones en una sola lista   | `GET .../maintenance` es por instalación (habría que hacer diez consultas) | Decisión en la Planning (US-076)             |
| Buscar socios por nombre o correo                               | No hay patrón de acceso                                                    | Pregunta abierta 2 de EP-06                  |
| Fotos de instalaciones administrables                           | `Resource` no tiene campo de imagen                                        | Fuera de EP-08 (pregunta abierta 5)          |

## Relación con EP-07 (cómo no rehacer trabajo)

US-070 y US-071 construyen los inicios como una **composición de bloques independientes** (situación de membresía, próxima reserva, accesos rápidos, pendientes), cada uno con su propia fuente de datos y sus estados de carga, error y vacío. Cuando EP-07 entregue sus endpoints:

- **US-056** reemplaza la fuente del bloque de situación (de `GET /members/me` a `GET /dashboard/member`, con `canReserve` y `alerts` del servidor) y **agrega** los bloques de avisos recientes y resumen de pagos. No rehace la página, la estructura ni los accesos rápidos.
- **US-059** reemplaza los contadores de pendientes (primera página del listado) por las cifras exactas de `GET /dashboard/admin` y **agrega** los bloques de métricas. Los accesos y las tarjetas de US-071 se conservan.
- Las pantallas nuevas de EP-05 (US-041, US-049), EP-06 (US-051, US-053) y EP-07 (US-060) se construyen con la tabla, las pestañas, el panel lateral y los avisos efímeros de este bloque A.

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- Ni `/socio` ni `/admin` muestran "en construcción".
- Reservar una instalación, cancelar una reserva, editar una instalación, crear o liberar un bloqueo, aprobar o rechazar una reserva y aprobar o rechazar una solicitud de socio se completan **sin salir de la pantalla en la que se inician** (ventana o panel lateral).
- Toda ventana y todo panel lateral atrapan el foco, se cierran con Escape y devuelven el foco al control que los abrió.
- Ninguna pantalla autenticada produce desplazamiento horizontal en un ancho de 375 px.
- Ninguna regla de negocio se mueve al frontend: los errores del servidor se siguen mostrando con su `error.code` traducido.
- No hay cambios en `apps/api`, en `docs/api/contratos-api.md` ni en `infrastructure/terraform/`.
- Los casos UX-01..UX-14 (sección "Casos de prueba UX propuestos", a incorporar por QA en la [matriz de trazabilidad](../../testing/matriz-trazabilidad.md)) quedan cubiertos.

## Casos de prueba UX propuestos (para la matriz de trazabilidad)

Propuesta para que QA los incorpore a [`docs/testing/matriz-trazabilidad.md`](../../testing/matriz-trazabilidad.md) como sección "Experiencia de usuario (EP-08)", con el mismo formato de columnas. Todos son verificables (sí/no), no de gusto. Tipos: IC (componente con Testing Library), M (manual documentada), E2E (si se incorpora Playwright, pregunta abierta 7).

| #     | Caso de prueba                                                                                                                                                                                 | Origen         | Endpoint(s)                                                                          | Tipo    | Severidad |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------ | ------- | --------- |
| UX-01 | Ventana: al abrir, el foco entra en ella; Tab y Shift+Tab no salen; Escape la cierra; al cerrar, el foco vuelve al control que la abrió; dos ventanas en la página no comparten `id`           | US-062         | N/A (frontend)                                                                       | IC + M  | Alta      |
| UX-02 | Panel lateral: mismo comportamiento de foco y Escape que UX-01; a 375 px ocupa todo el ancho                                                                                                   | US-063         | N/A (frontend)                                                                       | IC + M  | Media     |
| UX-03 | Pestañas: flechas, Inicio y Fin cambian de pestaña; `aria-selected` correcto; la pestaña activa sobrevive a recargar la página                                                                 | US-064, US-074 | N/A (frontend)                                                                       | IC      | Media     |
| UX-04 | Aviso efímero: éxito con `role="status"` desaparece a los 5 s; error con `role="alert"` permanece hasta cerrarse; ninguno roba el foco                                                         | US-066         | N/A (frontend)                                                                       | IC      | Media     |
| UX-05 | Ninguna pantalla autenticada produce desplazamiento horizontal a 375 px de ancho (ancho del documento ≤ ancho de la ventana)                                                                   | US-065, US-068 | N/A (frontend)                                                                       | M (E2E) | Alta      |
| UX-06 | Por debajo de 1024 px la navegación se abre con "Abrir menú" y se cierra al elegir un enlace o con Escape; "Saltar al contenido" es el primer elemento enfocable                               | US-068         | N/A (frontend)                                                                       | IC + M  | Media     |
| UX-07 | Crear una reserva sin salir de la ventana: desde "Nueva reserva", completar los cuatro pasos y confirmar sin cambiar de dirección; al terminar, aviso y la reserva en Mis reservas             | US-072, US-073 | `GET /resources/{id}/availability`, `POST /reservations`                             | IC + M  | Alta      |
| UX-08 | Volver a un paso anterior del asistente conserva instalación, fecha, franja, participantes y notas; un error de franja ocupada vuelve al paso 2 con la disponibilidad refrescada               | US-067, US-072 | `POST /reservations`                                                                 | IC      | Media     |
| UX-09 | Cancelar desde el panel de detalle pide confirmación en ventana; tras confirmar, la reserva cambia de estado sin recargar la página y aparece un aviso                                         | US-074         | `POST /reservations/{id}/cancel`                                                     | IC      | Media     |
| UX-10 | Rechazar una reserva o una solicitud de socio sin motivo mantiene deshabilitado el botón de confirmar; con motivo, el elemento sale de pendientes sin recargar la página                       | US-077, US-078 | `POST /reservations/{id}/reject`, `POST /members/{id}/reject`                        | IC      | Alta      |
| UX-11 | Un error del servidor al editar una instalación o crear un bloqueo se muestra dentro de la ventana, sin cerrarla y sin perder lo escrito                                                       | US-075, US-076 | `PATCH /resources/{id}`, `POST /resources/{id}/maintenance`                          | IC      | Media     |
| UX-12 | Inicio del socio con deuda: a 375 px el aviso con el acceso a pagar es visible sin desplazarse y "Nueva reserva" está deshabilitada con el motivo                                              | US-070         | `GET /members/me`                                                                    | IC + M  | Alta      |
| UX-13 | Inicio del administrador: las cantidades de pendientes coinciden con `/admin/solicitudes` y con la pestaña "Por aprobar"; más de cinco se muestra como "5 o más"; cada acceso abre su pantalla | US-071         | `GET /members?status=PENDING`, `GET /reservations?scope=all&status=PENDING_APPROVAL` | IC + M  | Media     |
| UX-14 | La verificación automática de accesibilidad no reporta violaciones de impacto serio o crítico en ningún componente de `packages/ui`; los pares de color cumplen WCAG AA                        | US-061, US-069 | N/A (frontend)                                                                       | IC      | Media     |

Resumen: 14 casos (5 de severidad alta, 9 media). Complementan T-01, T-02, T-03 y T-06 de la sección transversal de la matriz, que siguen vigentes.

## Alcance explícitamente fuera de EP-08

- Modo oscuro y temas personalizables (propuesto como fase posterior; pregunta abierta 3).
- Rediseño de la página pública de bienvenida (`/`) y de las pantallas de acceso más allá de heredar los tokens nuevos (pregunta abierta 8).
- Animaciones elaboradas, ilustraciones a medida o fotografía profesional.
- Aplicación móvil nativa (fase posterior, matriz de alcance §8).
- Cualquier cambio de reglas, contratos o infraestructura.

## Preguntas abiertas

1. **Dirección visual** (Product Owner). ¿Sobria y corporativa (la actual: azul institucional, verde/ámbar/rojo para estados) o más deportiva (más color, fotografía, tipografía condensada)? Propuesta: conservar la paleta definida en US-008 —ya pensada para adultos de 25 a 52 años, "moderna, activa, confiable, sin apariencia infantil ni agresiva"— y ganar carácter con jerarquía tipográfica, iconografía, imágenes por tipo de instalación y superficies con más contraste. Debe resolverse antes de US-061.
2. **Componentes propios o una librería** (Arquitecto, con ADR). Construir desde cero la ventana, el panel lateral y las pestañas es donde más fallan la accesibilidad y el manejo del foco. Propuesta: usar primitivas accesibles sin estilos (por ejemplo Radix UI o React Aria) envueltas en `packages/ui` con los tokens propios, de modo que las pantallas solo conozcan `@activa-club/ui`. Afecta las estimaciones de US-062..US-067 (las reduce si se adopta). Debe resolverse antes de la Ola 2 del Sprint 4B.
3. **Modo oscuro** (Product Owner). Propuesta: fase posterior. US-061 define tokens semánticos (superficie, texto, borde) que lo dejan preparado sin implementarlo.
4. **Iconografía** (Arquitecto). La navegación lateral y los accesos rápidos necesitan iconos. Propuesta: una librería de iconos SVG de licencia abierta (por ejemplo Lucide), como dependencia de `packages/ui`.
5. **Imágenes de las instalaciones** (Product Owner). El catálogo visual (US-073) gana mucho con una imagen por instalación, pero `Resource` no tiene campo de imagen. Propuesta: una imagen estática por tipo de recurso dentro del frontend (seis imágenes de licencia libre), sin backend. Si no se aprueba, se usan iconos.
6. **¿Ventanas y paneles con URL propia?** (Product Owner y Frontend). Propuesta: los paneles de detalle sí (`?reserva=<id>`, `?solicitud=<id>`), para que "atrás" del navegador los cierre y un enlace lleve directo a una reserva; el asistente de reserva solo guarda la instalación preseleccionada (`?recurso=<id>`), no el paso.
7. **Pruebas extremo a extremo automatizadas** (QA). El repositorio no tiene Playwright ni axe instalados, aunque T-01/T-02 los mencionan. Propuesta: US-069 incorpora la verificación automática de accesibilidad de componentes; los casos de pantalla completa (375 px, recorrido del asistente) se ejecutan como prueba manual documentada en el Sprint 4B, y Playwright se evalúa en la estabilización.
8. **Página pública y pantallas de acceso** (Product Owner). ¿Entran en el rediseño? Propuesta: solo heredan los tokens de US-061; un rediseño propio sería una historia aparte.
9. **Lugar en el calendario** (Product Owner). Ver la recomendación del [Sprint 4B](../sprints/sprint-4b-experiencia-interfaz.md): antes de continuar el Sprint 4 o en paralelo con él. No se reordenan los Sprints 4 y 5 sin su decisión.

## Historial de cambios

- 2026-10-11: Propuesta de la épica EP-08 y de las historias US-061..US-078 tras el reclamo del dueño del producto en la primera prueba extremo a extremo en `dev`. Pendiente de aprobación del Product Owner.
