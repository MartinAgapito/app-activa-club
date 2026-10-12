# docs/scrum — Product Backlog de Activa Club

Épicas, historias de usuario, sprints y definiciones Scrum del proyecto Activa Club.

Toda funcionalidad implementada debe partir de una historia de usuario aprobada aquí, con criterios de aceptación verificables, manteniendo trazabilidad entre épica, historia, tarea, código, pruebas y Pull Request (ver `docs/product/contexto-maestro.md`, sección "Metodología Scrum"). El Contexto Maestro es la fuente única de verdad; estos artefactos lo traducen en trabajo accionable.

## Documentos de gobernanza Scrum

- [Definition of Ready (DoR)](./definition-of-ready.md)
- [Definition of Done (DoD)](./definition-of-done.md)

## Documentos de producto relacionados

- [Visión y objetivos](../product/vision-y-objetivos.md)
- [Matriz de alcance (MVP / fase posterior / fuera de alcance)](../product/matriz-de-alcance.md)
- [Reglas de negocio por módulo](../product/reglas-de-negocio.md)

## Épicas

| ID                                                                   | Título                                                     | Fase            | Estado      |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ----------- |
| [EP-01](./epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) | Base cloud, arquitectura, DevOps y gobernanza del proyecto | MVP — Fundación | Cerrada     |
| [EP-02](./epicas/EP-02-migracion-activacion-acceso.md)               | Migración de socios, activación y acceso                   | MVP             | Cerrada     |
| [EP-03](./epicas/EP-03-membresias-pagos.md)                          | Membresías y pagos                                         | MVP             | Cerrada     |
| [EP-04](./epicas/EP-04-reservas-instalaciones.md)                    | Reservas de instalaciones                                  | MVP             | En progreso |
| [EP-05](./epicas/EP-05-notificaciones.md)                            | Notificaciones                                             | MVP             | Planificada |
| [EP-06](./epicas/EP-06-administracion.md)                            | Administración                                             | MVP             | Planificada |
| [EP-07](./epicas/EP-07-dashboards-analytics.md)                      | Dashboards y analytics                                     | MVP             | Planificada |
| [EP-08](./epicas/EP-08-experiencia-usuario-interfaz.md)              | Experiencia de usuario e interfaz (transversal)            | MVP (propuesta) | Propuesta   |

## Sprints

| Sprint                                                   | Nombre                                   | Épica        | Estado      |
| -------------------------------------------------------- | ---------------------------------------- | ------------ | ----------- |
| [Sprint 0](./sprints/sprint-0.md)                        | Fundación técnica y documental           | EP-01        | Cerrado     |
| [Sprint 1](./sprints/sprint-1.md)                        | Migración de socios, activación y acceso | EP-02        | Cerrado     |
| [Sprint 2](./sprints/sprint-2.md)                        | Membresías y pagos                       | EP-03        | Cerrado     |
| [Sprint 3](./sprints/sprint-3.md)                        | Reservas de instalaciones                | EP-04        | En curso    |
| [Sprint 4](./sprints/sprint-4.md)                        | Notificaciones                           | EP-05        | Planificado |
| [Sprint 4B](./sprints/sprint-4b-experiencia-interfaz.md) | Experiencia e interfaz                   | EP-08        | Propuesto   |
| [Sprint 5](./sprints/sprint-5.md)                        | Administración, dashboards y analytics   | EP-06, EP-07 | Planificado |

> **Sprint 4B** es una propuesta tras el reclamo del dueño del producto en la primera prueba extremo a extremo. Su posición (antes de continuar el Sprint 4, en paralelo o después) la decide el Product Owner; la recomendación y las alternativas están en el propio sprint. El orden de la tabla no implica una decisión.

## Historias del Sprint 0 (EP-01)

| ID                                                               | Título                                             | Responsable   | Prioridad  | Depende de             |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------- | ---------- | ---------------------- |
| [US-000](./historias/US-000-inicializar-monorepo-estandares.md)  | Inicializar monorepo y estándares de desarrollo    | DevOps        | Crítica    | —                      |
| [US-001](./historias/US-001-documentar-vision-alcance-reglas.md) | Documentar visión, alcance y reglas de negocio     | Scrum/Product | Crítica    | —                      |
| [US-002](./historias/US-002-documentar-arquitectura-base.md)     | Documentar arquitectura base y decisiones técnicas | Arquitecto    | Alta       | US-001                 |
| [US-003](./historias/US-003-modelo-datos-contratos-iniciales.md) | Definir modelo de datos y contratos iniciales      | Arquitecto    | Alta       | US-001                 |
| [US-004](./historias/US-004-base-infraestructura-terraform.md)   | Preparar base de infraestructura con Terraform     | DevOps        | Alta       | US-002                 |
| [US-005](./historias/US-005-ci-calidad-github-actions.md)        | Configurar CI de calidad con GitHub Actions        | DevOps        | Alta       | US-000                 |
| [US-006](./historias/US-006-estrategia-matriz-pruebas.md)        | Definir estrategia y matriz inicial de pruebas     | QA            | Media-Alta | US-001, US-003         |
| [US-007](./historias/US-007-gobierno-git-plantillas-pr.md)       | Definir gobierno Git y plantillas de Pull Request  | Git Steward   | Media-Alta | US-000                 |
| [US-008](./historias/US-008-mapa-rutas-design-foundation.md)     | Diseñar mapa de rutas y design foundation          | Frontend      | Media      | US-001, US-003         |
| [US-009](./historias/US-009-modulos-backend-flujo-migracion.md)  | Diseñar módulos backend y flujo de migración       | Backend       | Media      | US-002, US-003         |
| [US-010](./historias/US-010-validar-contratos-integracion.md)    | Validar contratos e integración planificada        | Integrador    | Media      | US-003, US-008, US-009 |

## Historias del Sprint 1 (EP-02)

| ID                                                                     | Título                                                 | Responsable        | Prioridad | Depende de     |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ | --------- | -------------- |
| [US-011](./historias/US-011-provisionar-endpoints-identidad-acceso.md) | Provisionar endpoints serverless de identidad y acceso | DevOps             | Crítica   | —              |
| [US-012](./historias/US-012-migracion-inicial-socios-dynamodb.md)      | Ejecutar la migración inicial de socios hacia DynamoDB | Backend            | Crítica   | US-011         |
| [US-013](./historias/US-013-activacion-cuenta-socio-dni.md)            | Activar cuenta de socio migrado con DNI                | Backend + Frontend | Alta      | US-011, US-012 |
| [US-014](./historias/US-014-login-correo-contrasena.md)                | Iniciar sesión con correo y contraseña                 | Frontend           | Alta      | —              |
| [US-015](./historias/US-015-recuperacion-contrasena.md)                | Recuperar contraseña                                   | Frontend           | Media     | US-014         |
| [US-016](./historias/US-016-registro-socio-nuevo.md)                   | Registrarse como socio nuevo                           | Backend + Frontend | Alta      | US-011         |
| [US-017](./historias/US-017-aprobacion-rechazo-socios.md)              | Aprobar o rechazar solicitudes de socios nuevos        | Backend + Frontend | Alta      | US-011, US-016 |
| [US-018](./historias/US-018-perfil-usuario.md)                         | Consultar y actualizar el perfil de usuario            | Backend + Frontend | Media     | US-011         |

## Historias del Sprint 2 (EP-03)

| ID                                                                     | Título                                                          | Responsable        | Prioridad | Depende de     |
| ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ | --------- | -------------- |
| [US-019](./historias/US-019-provisionar-endpoints-membresias-pagos.md) | Provisionar endpoints e infraestructura de membresías y pagos   | DevOps             | Crítica   | —              |
| [US-020](./historias/US-020-consultar-planes-membresia.md)             | Consultar los planes de membresía disponibles                   | Backend + Frontend | Alta      | US-019         |
| [US-021](./historias/US-021-cobro-membresia-idempotente-culqi.md)      | Cobrar la membresía con Culqi de forma idempotente y confirmada | Backend            | Crítica   | US-019         |
| [US-022](./historias/US-022-checkout-pago-membresia.md)                | Pagar la membresía desde la plataforma (checkout)               | Frontend           | Crítica   | US-020, US-021 |
| [US-023](./historias/US-023-renovacion-membresia-autorenovacion.md)    | Renovar la membresía y autorizar la renovación automática       | Backend + Frontend | Alta      | US-021, US-022 |
| [US-024](./historias/US-024-webhook-confirmacion-culqi.md)             | Confirmar pagos mediante el webhook de Culqi                    | Backend            | Alta      | US-019, US-021 |
| [US-025](./historias/US-025-historial-pagos.md)                        | Consultar el historial de pagos (socio y administrador)         | Backend + Frontend | Media     | US-021         |
| [US-026](./historias/US-026-manejo-seguro-datos-pago.md)               | Garantizar el manejo seguro de los datos de pago                | Backend + DevOps   | Alta      | US-021, US-024 |

## Historias del Sprint 3 (EP-04)

| ID                                                                       | Título                                                       | Responsable                 | Prioridad | Depende de             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------- | --------- | ---------------------- |
| [US-027](./historias/US-027-provisionar-endpoints-reservas.md)           | Provisionar endpoints e infraestructura de reservas          | DevOps                      | Crítica   | —                      |
| [US-028](./historias/US-028-catalogo-recursos-club.md)                   | Consultar el catálogo de instalaciones del club              | Backend + DevOps            | Crítica   | US-027                 |
| [US-029](./historias/US-029-disponibilidad-recurso-por-dia.md)           | Consultar la disponibilidad de una instalación por día       | Backend + Frontend          | Alta      | US-028                 |
| [US-030](./historias/US-030-crear-reserva-confirmacion-automatica.md)    | Reservar una instalación con validación completa en servidor | Backend                     | Crítica   | US-028                 |
| [US-031](./historias/US-031-participantes-socios-invitados.md)           | Agregar otros socios e invitados externos a una reserva      | Backend                     | Alta      | US-030                 |
| [US-032](./historias/US-032-reservar-instalacion-desde-plataforma.md)    | Reservar una instalación desde la plataforma                 | Frontend                    | Crítica   | US-029, US-030, US-031 |
| [US-033](./historias/US-033-consultar-cancelar-mis-reservas.md)          | Consultar y cancelar mis reservas                            | Backend + Frontend          | Alta      | US-030                 |
| [US-034](./historias/US-034-aprobacion-rechazo-reservas-admin.md)        | Aprobar o rechazar reservas de parrillas y salón social      | Backend + Frontend          | Alta      | US-030                 |
| [US-035](./historias/US-035-bloqueo-recursos-mantenimiento.md)           | Bloquear temporalmente un recurso por mantenimiento          | Backend + Frontend          | Media     | US-028, US-029         |
| [US-036](./historias/US-036-gestion-recursos-consulta-reservas-admin.md) | Gestionar recursos y consultar todas las reservas como admin | Backend + Frontend          | Media     | US-028, US-030         |
| [US-037](./historias/US-037-migrar-pasarela-culqi-a-stripe.md)           | Migrar la pasarela de pagos de Culqi a Stripe (test mode)    | Backend + Frontend + DevOps | Crítica   | US-019..US-026         |

> **US-037 es deuda técnica arrastrada de EP-03**, no una historia de reservas: se planifica en el Sprint 3 porque bloquea su precondición (socios `ACTIVE` al día). Ver [ADR-0011](../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md).

## Historias del Sprint 4 (EP-05)

| ID                                                                          | Título                                                                 | Responsable        | Prioridad | Depende de             |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ | --------- | ---------------------- |
| [US-038](./historias/US-038-actualizar-estado-membresia-por-vencimiento.md) | Actualizar el estado de la membresía según su vencimiento              | Backend + DevOps   | Crítica   | US-021                 |
| [US-039](./historias/US-039-provisionar-endpoints-notificaciones.md)        | Provisionar endpoints e infraestructura de notificaciones              | DevOps             | Crítica   | —                      |
| [US-040](./historias/US-040-emitir-notificaciones-eventos.md)               | Emitir notificaciones de eventos (bandeja interna y correo)            | Backend + DevOps   | Crítica   | US-039                 |
| [US-041](./historias/US-041-bandeja-notificaciones-socio.md)                | Consultar mi bandeja de notificaciones y marcarlas como leídas         | Backend + Frontend | Alta      | US-039, US-040         |
| [US-042](./historias/US-042-notificar-eventos-cuenta.md)                    | Notificar la activación de cuenta y la decisión sobre una solicitud    | Backend            | Alta      | US-040                 |
| [US-043](./historias/US-043-notificar-resultado-pagos.md)                   | Notificar el resultado de un pago                                      | Backend            | Alta      | US-040                 |
| [US-044](./historias/US-044-notificar-cambios-estado-reservas.md)           | Notificar los cambios de estado de una reserva                         | Backend            | Alta      | US-040                 |
| [US-045](./historias/US-045-notificar-mantenimiento-socios-afectados.md)    | Avisar a los socios afectados por un mantenimiento                     | Backend            | Media     | US-040                 |
| [US-046](./historias/US-046-recordatorio-reserva.md)                        | Recordar una reserva próxima                                           | Backend + DevOps   | Media     | US-040                 |
| [US-047](./historias/US-047-avisar-renovacion-proxima-vencida.md)           | Avisar que la membresía está por vencer o ya venció                    | Backend            | Media     | US-038, US-040         |
| [US-048](./historias/US-048-publicar-notificacion-segmentada.md)            | Publicar una notificación segmentada (servidor)                        | Backend            | Alta      | US-038, US-039, US-040 |
| [US-049](./historias/US-049-consola-admin-notificaciones.md)                | Publicar y consultar notificaciones desde la consola de administración | Backend + Frontend | Alta      | US-048                 |

> **US-038 es deuda técnica de EP-03**: hoy ningún proceso recalcula `membershipStatus` cuando vence la membresía, así que un socio vencido sigue pudiendo reservar y no hay socios "por vencer" a quienes avisar. Se planifica en el Sprint 4 porque bloquea los avisos de renovación y los segmentos de EP-05, igual que US-037 en el Sprint 3.

## Historias del Sprint 5 (EP-06, EP-07)

| ID                                                                    | Título                                                                                  | Responsable        | Prioridad | Depende de             |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | --------- | ---------------------- |
| [US-050](./historias/US-050-ver-mi-historial-pagos.md)                | Ver mi historial de pagos en la plataforma                                              | Frontend           | Media     | US-025                 |
| [US-051](./historias/US-051-consultar-socios-admin.md)                | Consultar los socios y su situación de membresía                                        | Frontend           | Alta      | US-017                 |
| [US-052](./historias/US-052-filtrar-socios-situacion-membresia.md)    | Filtrar socios con deuda, vencidos o por vencer                                         | Backend + Frontend | Media     | US-038, US-051         |
| [US-053](./historias/US-053-consultar-pagos-socios-admin.md)          | Consultar los pagos de los socios                                                       | Frontend           | Media     | US-025                 |
| [US-054](./historias/US-054-provisionar-endpoints-dashboards.md)      | Provisionar endpoints e infraestructura de dashboards                                   | DevOps             | Crítica   | —                      |
| [US-055](./historias/US-055-resumen-personal-socio-servidor.md)       | Obtener el resumen personal del socio (servidor)                                        | Backend            | Alta      | US-038, US-041, US-054 |
| [US-056](./historias/US-056-ver-inicio-personal-socio.md)             | Ver mi inicio personal (dashboard del socio)                                            | Frontend           | Alta      | US-055                 |
| [US-057](./historias/US-057-metricas-socios-pagos-notificaciones.md)  | Calcular las métricas de socios, membresías, pagos y notificaciones (servidor)          | Backend            | Alta      | US-038, US-054         |
| [US-058](./historias/US-058-metricas-reservas-ocupacion.md)           | Calcular las métricas de reservas y ocupación (servidor)                                | Backend            | Media     | US-054                 |
| [US-059](./historias/US-059-ver-resumen-operativo-admin.md)           | Ver el resumen operativo en el inicio del administrador                                 | Frontend           | Alta      | US-057                 |
| [US-060](./historias/US-060-ver-analitica-reservas-ocupacion.md)      | Ver la analítica de reservas y ocupación                                                | Frontend           | Media     | US-058                 |
| [US-080](./historias/US-080-nombres-participantes-detalle-reserva.md) | Devolver el nombre de los socios participantes en el detalle de una reserva (servidor)  | Backend            | Media     | US-033                 |
| [US-081](./historias/US-081-nombre-socio-rango-fechas-pagos-admin.md) | Nombre del socio y rango de fechas en la consulta de pagos del administrador (servidor) | Backend + DevOps   | Media     | US-025                 |

> **US-050 es deuda de EP-03**: el servidor del historial de pagos (US-025) está implementado, pero la pantalla del socio nunca se construyó. EP-06 agrupa US-051..US-053 y EP-07 agrupa US-054..US-060.

> **Adenda de contrato (2026-10-12)**: US-052 y US-058 están **Ready** con el contrato definido en `docs/api/contratos-api.md` §12 y [ADR-0014](../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md). US-080 (EP-04) y US-081 (EP-06) son historias pequeñas de backend que cubren límites de contrato detectados al construir la interfaz.

## Historias del Sprint 4B (EP-08, propuesto)

| ID                                                                              | Título                                                                   | Bloque | Responsable   | Prioridad | Depende de                             |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ | ------------- | --------- | -------------------------------------- |
| [US-061](./historias/US-061-ampliar-tokens-diseno.md)                           | Ampliar los tokens de diseño (superficies, tipografía, capas y estados)  | A      | Frontend      | Crítica   | —                                      |
| [US-062](./historias/US-062-componente-modal-accesible.md)                      | Componente de ventana modal accesible                                    | A      | Frontend      | Crítica   | US-061                                 |
| [US-063](./historias/US-063-componente-drawer-panel-lateral.md)                 | Componente de panel lateral (drawer)                                     | A      | Frontend      | Alta      | US-062                                 |
| [US-064](./historias/US-064-componente-tabs.md)                                 | Componente de pestañas                                                   | A      | Frontend      | Alta      | US-061                                 |
| [US-065](./historias/US-065-componente-tabla-datos-responsive.md)               | Componente de tabla de datos responsive                                  | A      | Frontend      | Alta      | US-061                                 |
| [US-066](./historias/US-066-componente-toast-avisos-efimeros.md)                | Componente de avisos efímeros (toast)                                    | A      | Frontend      | Alta      | US-061                                 |
| [US-067](./historias/US-067-componente-stepper.md)                              | Componente indicador de pasos (stepper)                                  | A      | Frontend      | Alta      | US-061                                 |
| [US-068](./historias/US-068-estructura-aplicacion-por-rol.md)                   | Navegar con barra lateral y cabecera según mi rol                        | A      | Frontend      | Alta      | US-061, US-063                         |
| [US-069](./historias/US-069-catalogo-componentes-verificacion-accesibilidad.md) | Catálogo de componentes y verificación automática de accesibilidad       | A      | Frontend + QA | Media     | US-062..US-067                         |
| [US-070](./historias/US-070-inicio-socio-datos-existentes.md)                   | Ver mi situación y mi próxima reserva al entrar (inicio del socio)       | B      | Frontend      | Alta      | US-068                                 |
| [US-071](./historias/US-071-inicio-admin-pendientes.md)                         | Ver lo que requiere mi atención al entrar (inicio del administrador)     | B      | Frontend      | Alta      | US-065, US-068                         |
| [US-072](./historias/US-072-asistente-reserva-en-ventana.md)                    | Reservar una instalación con un asistente por pasos en ventana           | C      | Frontend      | Crítica   | US-062, US-066, US-067                 |
| [US-073](./historias/US-073-catalogo-instalaciones-entrada-asistente.md)        | Elegir la instalación desde un catálogo visual que abre el asistente     | C      | Frontend      | Media     | US-072                                 |
| [US-074](./historias/US-074-mis-reservas-panel-detalle.md)                      | Consultar mis reservas en pestañas con panel de detalle y cancelación    | C      | Frontend      | Alta      | US-062, US-063, US-064, US-065, US-066 |
| [US-075](./historias/US-075-admin-editar-recurso-modal.md)                      | Editar una instalación desde una ventana                                 | C      | Frontend      | Media     | US-062, US-064, US-065, US-066         |
| [US-076](./historias/US-076-admin-bloqueos-mantenimiento-modal.md)              | Crear y liberar bloqueos de mantenimiento desde ventanas                 | C      | Frontend      | Media     | US-062, US-064, US-065, US-066         |
| [US-077](./historias/US-077-admin-reservas-pestanas-detalle-decision.md)        | Revisar y decidir reservas desde pestañas, panel de detalle y ventanas   | C      | Frontend      | Alta      | US-062..US-066                         |
| [US-078](./historias/US-078-admin-solicitudes-socios-panel-decision.md)         | Revisar y decidir solicitudes de socios desde panel de detalle y ventana | C      | Frontend      | Media     | US-062, US-063, US-065, US-066         |
| [US-079](./historias/US-079-pantallas-acceso-estilo-nuevo.md)                   | Entrar al club con pantallas de acceso del nuevo estilo visual           | B      | Frontend      | Alta      | US-061                                 |

> **EP-08 es solo frontend** sobre endpoints ya desplegados: bloque A (base de diseño), B (inicio útil) y C (flujos rehechos con ventanas y paneles). El bloque A bloquea a B y C. US-070 y US-071 se construyen como bloques que US-056 y US-059 (EP-07) enriquecerán sin rehacerlos.

## Convenciones de trazabilidad

- Épica: `EP-NN`
- Historia / tarea técnica: `US-NNN`
- Regla de negocio: `RN-<MODULO>-NN` (ver [reglas de negocio](../product/reglas-de-negocio.md))
- Trazabilidad esperada: épica → historia → criterios de aceptación → pruebas → Pull Request.

## Historial de cambios

- 2026-07-09: Creación del backlog inicial, EP-01 y Sprint 0 (US-001).
- 2026-07-16: Creación de EP-02 y Sprint 1 con las historias US-011..US-018; renumeración de las épicas funcionales siguientes.
- 2026-08-09: Creación de EP-03 y Sprint 2 con las historias US-019..US-026 (membresías y pagos); actualización de los estados de Sprint 0/1 y EP-01/EP-02 a cerrados.
- 2026-08-09: Creación de EP-04 y Sprint 3 con las historias US-027..US-036 (reservas de instalaciones).
- 2026-10-10: Cierre documental de EP-01..EP-03 (Cerradas) y avance de EP-04 / Sprint 3 (en curso): implementadas en backend US-027..US-031, US-033 y US-034 (más US-037 Stripe); pendientes US-032 (flujo de reserva en la interfaz), US-035, US-036 y la verificación E2E.
- 2026-10-11: EP-04 con las diez historias implementadas (backend y pantallas); pendiente la verificación extremo a extremo.
- 2026-10-11: Creación de EP-05 (notificaciones), EP-06 (administración) y EP-07 (dashboards y analytics) y de los Sprints 4 y 5 con las historias US-038..US-060. US-038 (vencimiento de membresía) y US-050 (pantalla de historial de pagos del socio) son deuda técnica de EP-03. Cada épica registra sus preguntas abiertas.
- 2026-10-11: Propuesta de EP-08 (experiencia de usuario e interfaz, transversal y solo frontend) y del Sprint 4B con las historias US-061..US-078, tras el reclamo del dueño del producto en la primera prueba extremo a extremo en `dev` (inicio vacío, estilos básicos, CRUD sin ventanas). Pendiente de aprobación del Product Owner, incluida su posición respecto del Sprint 4. Notas de coordinación agregadas en EP-07, US-056 y US-059.
- 2026-10-11: US-079 (pantallas de acceso con el nuevo estilo visual), pedido del dueño del producto; se agrega a EP-08 (bloque B) y al Sprint 4B, adelantada de la Ola 4 a la Ola 3.
- 2026-10-12: Adenda de contrato de Sprint 5 (contratos §12, ADR-0014): US-052 y US-058 pasan a Ready; nuevas historias US-080 (nombres de participantes en el detalle de reserva) y US-081 (nombre del socio y rango de fechas en pagos del administrador).
