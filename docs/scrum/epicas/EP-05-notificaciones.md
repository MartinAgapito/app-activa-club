# EP-05 — Notificaciones

| Campo            | Valor               |
| ---------------- | ------------------- |
| ID               | EP-05               |
| Tipo             | Épica               |
| Fase             | MVP                 |
| Estado           | Planificada         |
| Dependencias     | EP-02, EP-03, EP-04 |
| Sprint principal | Sprint 4            |

## Descripción

Entregar el módulo de notificaciones de Activa Club: la **bandeja interna** del socio (obligatoria en el MVP), los **correos transaccionales** por Amazon SES, los **avisos automáticos** de los trece eventos del catálogo `NotificationEvent` y la **publicación de avisos segmentados** por parte del administrador.

La épica se construye sobre lo que ya existe y nunca se usó: las entidades `Notification` y `MemberNotification` ([modelo de datos §3.12–3.13](../../data/modelo-dynamodb.md)), con sus claves ya definidas en `apps/api/src/lib/dynamo.ts`; los contratos de [`docs/api/contratos-api.md`](../../api/contratos-api.md) §8; el esquema `createNotificationSchema` de `packages/validation`; la identidad de remitente SES por ambiente (`modules/ses-identity`, [ADR-0006](../../architecture/adr/ADR-0006-ses-correos-transaccionales.md)); y las pantallas placeholder `/socio/notificaciones` y `/admin/notificaciones`. No introduce entidades nuevas; la única extensión de contrato que puede requerir es la que el Arquitecto decida para el patrón de acceso de los segmentos (pregunta abierta 12).

## Valor de negocio

Tres sprints seguidos dejaron eventos "con el rastro previsto, sin construir el módulo": activación, aprobación y rechazo (Sprint 1), pago exitoso y fallido (Sprint 2), y los seis de reservas y mantenimiento (Sprint 3). Hoy un socio no se entera de que su parrilla fue aprobada, de que un administrador le canceló una reserva, de que su cancha entra en mantenimiento ni de que su membresía está por vencer. Y el club no tiene ningún canal para comunicarse con sus socios desde la plataforma.

EP-05 cierra esa deuda y convierte la plataforma en un canal de comunicación de doble vía: el sistema avisa de lo que pasa y el administrador puede hablarle a todo el padrón, a un grupo o a una persona.

## Objetivos de la épica

- Infraestructura de los cuatro endpoints de notificaciones y del permiso de envío de correo, provisionada en Terraform (US-039).
- **Una sola capacidad de emisión** reutilizable: bandeja interna obligatoria más correo _best-effort_ que nunca rompe la operación de negocio (US-040).
- **Bandeja del socio** consultable y marcable como leída (US-041).
- **Avisos automáticos** de los trece eventos de RN-NOT-04, agrupados por módulo de origen: cuenta (US-042), pagos (US-043), reservas (US-044), mantenimiento (US-045), recordatorio de reserva (US-046) y renovación (US-047).
- **Publicación segmentada** por el administrador en los siete segmentos de RN-NOT-03, con historial de lo enviado (US-048, US-049).

## Historias asociadas

| ID                                                                        | Título                                                                 | Responsable        | Depende de             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------ | ---------------------- |
| [US-039](../historias/US-039-provisionar-endpoints-notificaciones.md)     | Provisionar endpoints e infraestructura de notificaciones              | DevOps             | —                      |
| [US-040](../historias/US-040-emitir-notificaciones-eventos.md)            | Emitir notificaciones de eventos (bandeja interna y correo)            | Backend + DevOps   | US-039                 |
| [US-041](../historias/US-041-bandeja-notificaciones-socio.md)             | Consultar mi bandeja de notificaciones y marcarlas como leídas         | Backend + Frontend | US-039, US-040         |
| [US-042](../historias/US-042-notificar-eventos-cuenta.md)                 | Notificar la activación de cuenta y la decisión sobre una solicitud    | Backend            | US-040                 |
| [US-043](../historias/US-043-notificar-resultado-pagos.md)                | Notificar el resultado de un pago                                      | Backend            | US-040                 |
| [US-044](../historias/US-044-notificar-cambios-estado-reservas.md)        | Notificar los cambios de estado de una reserva                         | Backend            | US-040                 |
| [US-045](../historias/US-045-notificar-mantenimiento-socios-afectados.md) | Avisar a los socios afectados por un mantenimiento                     | Backend            | US-040                 |
| [US-046](../historias/US-046-recordatorio-reserva.md)                     | Recordar una reserva próxima                                           | Backend + DevOps   | US-040                 |
| [US-047](../historias/US-047-avisar-renovacion-proxima-vencida.md)        | Avisar que la membresía está por vencer o ya venció                    | Backend            | US-038, US-040         |
| [US-048](../historias/US-048-publicar-notificacion-segmentada.md)         | Publicar una notificación segmentada (servidor)                        | Backend            | US-038, US-039, US-040 |
| [US-049](../historias/US-049-consola-admin-notificaciones.md)             | Publicar y consultar notificaciones desde la consola de administración | Backend + Frontend | US-048                 |

> **Dependencia externa a la épica: [US-038](../historias/US-038-actualizar-estado-membresia-por-vencimiento.md)** (deuda técnica de EP-03, Sprint 4). Hoy ningún proceso recalcula `membershipStatus` cuando pasa la fecha de vencimiento, así que no existen socios "por vencer" ni "vencidos" a quienes avisar o segmentar. US-047 y US-048 no pueden cerrarse sin ella.

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- Cada uno de los trece eventos de `NotificationEvent` deja un aviso en la bandeja del socio afectado cuando ocurre, y solo cuando ocurre con éxito (RN-NOT-01, RN-NOT-04).
- Cada aviso automático intenta además el correo transaccional; un fallo de correo nunca revierte ni hace fallar la operación de negocio que lo originó (RN-NOT-02, ADR-0006).
- Ningún hecho genera dos avisos, aunque el proceso se reintente o converjan dos caminos (respuesta síncrona y webhook de pagos, procesos programados ejecutados dos veces).
- El socio ve y marca como leída únicamente su propia bandeja.
- El administrador publica avisos a los segmentos `ALL`, `ACTIVE`, `DEBT`, `EXPIRED`, `EXPIRING_SOON`, `SINGLE` y `BY_RESOURCE`; cada aviso llega exactamente a los socios del segmento y queda auditado como `NOTIFICATION_SENT` (RN-NOT-03, RN-ADM-06).
- Ningún aviso ni correo contiene datos de tarjeta, secretos, DNI completos ni datos de otros socios (RN-PAG-08).
- Los casos N-01..N-12, A-07, P-11 y R-21 de la matriz de trazabilidad quedan cubiertos.
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance, sección 5.

## Alcance explícitamente fuera de EP-05

Clasificado como **fase posterior** o **fuera de alcance** en la matriz de alcance §5 (no se implementa):

- Notificaciones por WhatsApp (fase posterior).
- Notificaciones push móviles (fase posterior).
- SMS (fuera de alcance).

No está en el Contexto Maestro y, por lo tanto, no se implementa sin aprobación del Product Owner:

- Preferencias de notificación del socio (darse de baja de correos, silenciar tipos de aviso).
- Programar publicaciones para más tarde, adjuntos, imágenes o plantillas reutilizables para el administrador.
- Ver quién leyó un aviso publicado, editarlo o retirarlo.
- Eliminar notificaciones de la bandeja o marcarlas todas como leídas.
- Avisos a los socios participantes y a los invitados externos de una reserva (solo el titular recibe avisos; ver pregunta abierta 4).
- **El cobro desatendido de la renovación automática** sigue siendo una decisión pendiente de EP-03. Los avisos de renovación (US-047) no lo prometen.

Pertenece al MVP pero se entrega en otras épicas:

- Las **notificaciones recientes en el inicio del socio** (`recentNotifications` de `GET /dashboard/member`): EP-07, US-055/US-056.
- La **métrica de notificaciones enviadas** del dashboard administrativo (RN-ANL-08): EP-07, US-057. EP-05 deja los datos y el historial (US-049).

## Dependencias con épicas anteriores

- **EP-02** (disponible): socios con cuenta digital, email y sesión Cognito; los eventos de activación, aprobación y rechazo ya dejan auditoría.
- **EP-03** (disponible, con deuda): pagos confirmados por respuesta síncrona y webhook contra Stripe test mode (US-037). **Deuda bloqueante para EP-05: US-038**, el recálculo diario del estado de membresía.
- **EP-04** (implementada, verificación extremo a extremo pendiente): reservas, aprobación, cancelación y mantenimiento con `affectedReservationCount`; cada acción deja el rastro de evento previsto.
- **EP-01** (disponible): identidad SES por ambiente en Terraform, módulo `endpoint`, auditoría y logging estructurado.

## Preguntas abiertas

Cada una trae una propuesta del Product Analyst para que la Planning no arranque bloqueada; ninguna se implementa en sentido distinto sin la confirmación indicada.

1. **Umbral de "por vencer"** (Product Owner). Propuesta: 7 días, el mismo que ya usa la migración (`docs/data/mapeo-migracion.md`). El aviso `RENEWAL_DUE` se emite una vez, al entrar en ese umbral.
2. **¿Vencer la membresía genera deuda?** (Product Owner). Propuesta: no. Vencida y con deuda son situaciones distintas en el Contexto Maestro; US-038 marca `EXPIRED` sin tocar `outstandingBalance`.
3. **¿La notificación interna debe escribirse en la misma transacción que la operación de negocio?** (Arquitecto). RN-NOT-01 la declara obligatoria, pero meterla en cada transacción existente (reserva, pago, aprobación) cambia código ya cerrado. Propuesta: escritura inmediatamente posterior, con alarma ante fallo (US-040, criterio 7).
4. **¿Reciben avisos los socios participantes de una reserva?** (Product Owner). Propuesta: no en el MVP; solo el titular, coherente con RN-RES-06 y con US-033 (los participantes tampoco ven la reserva en su listado).
5. **¿Aviso al crear una reserva que queda pendiente de aprobación?** (Product Owner). No está en el catálogo de RN-NOT-04. Propuesta: no; la interfaz de reserva ya informa el estado.
6. **Contador de no leídas en el menú** (Arquitecto). El contrato no lo devuelve. Propuesta: no exigirlo en el MVP; si se quiere, agregar un `unreadCount` al contrato de `GET /notifications`.
7. **Qué se le dice al socio afectado por un mantenimiento** (Product Owner). Las reservas no se cancelan solas (decisión de EP-04) y el socio no puede cancelar con menos de 24 horas. Propuesta: el aviso informa y sugiere contactar al club; el administrador cancela sin restricción desde la consola (US-036) si corresponde. Alternativa a evaluar: permitir al socio cancelar sin la restricción de 24 horas una reserva afectada por mantenimiento (cambio de regla RN-RES-10).
8. **Momento del recordatorio de reserva** (Product Owner). Propuesta: un proceso diario a las 18:00 de Lima que recuerda las reservas del día siguiente. Alternativa: un recordatorio N horas antes, con un proceso más frecuente.
9. **Qué eventos envían correo** (Product Owner). Propuesta: todos los automáticos, y los publicados por el administrador solo con `alsoEmail=true`.
10. **Definición exacta de los segmentos** (Product Owner). Propuesta en la tabla de US-048: solo socios con cuenta digital; `ACTIVE` son los socios al día (incluye a los que están por vencer, excluye a los que tienen deuda); `BY_RESOURCE` toma titulares de reservas activas y futuras en el recurso.
11. **Publicación a un segmento sin destinatarios** (Arquitecto). Propuesta: rechazarla sin registrar nada, con un código de error que el Arquitecto agregue al contrato.
12. **Patrón de acceso de los segmentos `DEBT`, `EXPIRED` y `EXPIRING_SOON`** (Arquitecto). GSI2 indexa socios por `memberStatus`, no por `membershipStatus`. Propuesta: consultar `MEMBER#STATUS#ACTIVE` y filtrar por `membershipStatus`, aceptable para el volumen mock y sin índice nuevo; documentarlo en el modelo de datos. La misma resolución sirve a US-052.
13. **¿Los avisos automáticos cuentan como "notificaciones enviadas" y aparecen en el historial del administrador?** (Product Owner). Cada evento crea un registro `Notification` (`createdBy=SYSTEM`), así que el historial y la métrica crecen con cada reserva y pago. Propuesta: ambos se muestran, distinguidos por origen; si el historial se vuelve ruidoso, agregar un filtro por origen al contrato de `GET /notifications/sent`.
14. **Límites de SES en sandbox para publicaciones masivas** (Arquitecto/DevOps). El sandbox limita destinatarios verificados y tasa de envío. Propuesta: suficiente para la demo con socios de prueba verificados; salir del sandbox sigue fuera de alcance (ADR-0006).

## Historial de cambios

- 2026-10-11: Creación de la épica EP-05 y asociación de las historias del Sprint 4 (US-039..US-049), con US-038 como deuda técnica de EP-03 de la que depende.
- 2026-10-12: US-039 con infraestructura desplegada, pendiente lógica (endpoints en 501 hasta US-041, US-048 y US-049; `ses:SendEmail` concedido a las Lambdas emisoras).
- 2026-10-12: US-040 implementada (motor de emisión: bandeja idempotente + correo best-effort + 13 textos), pendiente consumo por US-042..US-047.
- 2026-10-12: US-045 implementada (aviso de mantenimiento a titulares de reservas afectadas desde el bloqueo y desde el PATCH a MAINTENANCE), pendiente verificación en `dev`.
