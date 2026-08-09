# EP-04 — Reservas de instalaciones

| Campo            | Valor               |
| ---------------- | ------------------- |
| ID               | EP-04               |
| Tipo             | Épica               |
| Fase             | MVP                 |
| Estado           | Planificada         |
| Dependencias     | EP-01, EP-02, EP-03 |
| Sprint principal | Sprint 3            |

## Descripción

Entregar el tercer bloque funcional de negocio de Activa Club: permitir que un **socio activo y al día** reserve las instalaciones del club (fútbol, tenis, pádel, piscina, parrillas y salón social), agregue a otros socios e invitados externos como participantes, consulte y cancele sus reservas, y que el administrador apruebe o rechace las reservas que lo requieren, gestione el aforo y el horario de los recursos y los bloquee temporalmente por mantenimiento.

La épica implementa las doce reglas del módulo RN-RES sobre el modelo de datos ya decidido (`Resource`, `Reservation`, `ReservationParticipant`, `GuestMonthlyCounter`, `MaintenanceBlock`, ver [modelo de datos §3.7–3.11](../../data/modelo-dynamodb.md)) y sobre los contratos definidos en [`docs/api/contratos-api.md`](../../api/contratos-api.md) §6 y §7 desde el Sprint 0.

Al cerrar las decisiones funcionales pendientes (ver más abajo) se agregaron **dos endpoints de lectura** para resolver participantes por DNI (`GET /members/lookup`, `GET /guests/lookup`) y **una entidad**, `GuestProfile` ([modelo §3.15](../../data/modelo-dynamodb.md)), sin la cual RN-RES-03/04 no era implementable desde la interfaz. Fuera de eso, la épica no introduce contratos ni entidades nuevas.

## Valor de negocio

Reservar instalaciones es **la razón por la que un socio usa el club**. Los dos bloques anteriores construyeron el camino de entrada (EP-02: existir como cuenta digital) y el de habilitación (EP-03: estar activo y al día), pero hasta ahora ninguna de las dos cosas sirve para nada operativo: un socio `ACTIVE` con su membresía pagada todavía no puede hacer aquello por lo que paga.

EP-04 también es donde el sistema demuestra que **las reglas de negocio se cumplen del lado del servidor y bajo concurrencia**: dos socios que piden la misma cancha a la misma hora, un invitado que intenta su tercera visita del mes, un socio que aparece en dos reservas superpuestas, o alguien con deuda intentando reservar. Es el módulo con más reglas simultáneas del MVP y el que cierra los casos pendientes heredados de las dos épicas anteriores (`A-11`, `A-15` y `P-10` de la [matriz de trazabilidad](../../testing/matriz-trazabilidad.md)).

## Objetivos de la épica

- Infraestructura de los trece endpoints serverless de recursos, reservas y resolución de participantes provisionada en Terraform, con la autorización por rol del contrato.
- **Catálogo de recursos** del club disponible y consultable, con el aforo, la duración de bloque, el horario y la exigencia de aprobación de cada instalación según RN-RES, cargado como dato de infraestructura versionado en Terraform ([ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md)).
- **Disponibilidad por recurso y día**, que considera reservas activas y bloqueos de mantenimiento (RN-RES-01/07/11).
- **Creación de reserva con validación completa en el servidor**: elegibilidad del socio (RN-RES-12 / RN-PAG-06), horario y duración de bloque, cruces por recurso (RN-RES-07), aforo (RN-RES-09) y mantenimiento (RN-RES-11).
- **Confirmación automática** para fútbol, tenis, pádel y piscina; **aprobación administrativa** para parrillas y salón social (RN-RES-01/02).
- **Participantes**: otros socios e invitados externos en cualquier espacio, identificados **por DNI** con exposición mínima de datos ([ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)), sin superposición de un mismo sujeto (RN-RES-03/04/08) y con el tope de **dos visitas al mes por invitado externo** (RN-RES-05).
- **Responsabilidad del titular** registrada explícitamente sobre la reserva y sus participantes (RN-RES-06).
- **Cancelación** por el socio hasta 24 horas antes del inicio, con devolución del cupo mensual de los invitados (RN-RES-10 + RN-RES-05); el administrador puede cancelar sin esa restricción.
- **Mantenimiento y gestión de recursos** por el administrador: bloqueo temporal de franjas, liberación del bloqueo y edición de aforo, horario y estado (RN-RES-11, RN-ADM-04).
- **Visibilidad correcta**: el socio ve y opera únicamente sus propias reservas; el administrador consulta todas con filtros (RN-ADM-07).

## Historias asociadas

| ID                                                                        | Título                                                       | Responsable        | Depende de             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------ | ---------------------- |
| [US-027](../historias/US-027-provisionar-endpoints-reservas.md)           | Provisionar endpoints e infraestructura de reservas          | DevOps             | —                      |
| [US-028](../historias/US-028-catalogo-recursos-club.md)                   | Consultar el catálogo de instalaciones del club              | Backend + DevOps   | US-027                 |
| [US-029](../historias/US-029-disponibilidad-recurso-por-dia.md)           | Consultar la disponibilidad de una instalación por día       | Backend + Frontend | US-028                 |
| [US-030](../historias/US-030-crear-reserva-confirmacion-automatica.md)    | Reservar una instalación con validación completa en servidor | Backend            | US-028                 |
| [US-031](../historias/US-031-participantes-socios-invitados.md)           | Agregar otros socios e invitados externos a una reserva      | Backend            | US-030                 |
| [US-032](../historias/US-032-reservar-instalacion-desde-plataforma.md)    | Reservar una instalación desde la plataforma                 | Frontend           | US-029, US-030, US-031 |
| [US-033](../historias/US-033-consultar-cancelar-mis-reservas.md)          | Consultar y cancelar mis reservas                            | Backend + Frontend | US-030                 |
| [US-034](../historias/US-034-aprobacion-rechazo-reservas-admin.md)        | Aprobar o rechazar reservas de parrillas y salón social      | Backend + Frontend | US-030                 |
| [US-035](../historias/US-035-bloqueo-recursos-mantenimiento.md)           | Bloquear temporalmente un recurso por mantenimiento          | Backend + Frontend | US-028, US-029         |
| [US-036](../historias/US-036-gestion-recursos-consulta-reservas-admin.md) | Gestionar recursos y consultar todas las reservas como admin | Backend + Frontend | US-028, US-030         |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- Un socio `ACTIVE` sin deuda puede reservar fútbol, tenis, pádel o piscina y la reserva queda `CONFIRMED` de inmediato cuando hay disponibilidad (RN-RES-01).
- Una reserva de parrilla o salón social queda `PENDING_APPROVAL` y solo pasa a `APPROVED` o `REJECTED` por decisión de un administrador, con auditoría (RN-RES-02, RN-ADM-05).
- Un socio con deuda, con membresía vencida o que no está `ACTIVE` **no** puede crear reservas: el servidor responde `MEMBER_HAS_DEBT` o `MEMBERSHIP_REQUIRED` (RN-RES-12, RN-PAG-06). Cierra el caso P-10 heredado de EP-03 y los casos A-11 y A-15 de EP-02.
- Ninguna reserva se crea si se cruza con otra del mismo recurso, si supera el aforo, si cae fuera del horario del recurso, si el recurso está en mantenimiento en esa franja, si algún participante ya está en otra reserva superpuesta, o si un invitado externo excede sus dos visitas del mes (RN-RES-05/07/08/09/11).
- Toda regla anterior se valida en el backend; el frontend solo la anticipa para dar una buena experiencia, nunca la sustituye.
- El socio titular queda registrado como `HOLDER` responsable de la reserva y de sus participantes (RN-RES-06).
- Un socio puede cancelar su reserva hasta 24 horas antes del inicio; después recibe `CANCELLATION_TOO_LATE`. El administrador puede cancelar sin esa restricción (RN-RES-10).
- La cancelación y el rechazo administrativo liberan la franja y devuelven el cupo mensual consumido por los invitados externos de esa reserva (RN-RES-05).
- El administrador puede bloquear un recurso por mantenimiento y liberarlo; mientras el bloqueo existe, la franja no admite reservas nuevas y se muestra explícitamente **en mantenimiento** (no como una franja ocupada cualquiera) en la disponibilidad; las reservas ya existentes en esa franja no se cancelan solas (RN-RES-11).
- El administrador puede editar aforo, horario y estado de un recurso y el cambio se refleja en la disponibilidad (RN-ADM-04).
- Un socio no ve ni puede operar reservas de otro socio; el administrador consulta todas con filtros por recurso, estado y rango de fechas (RN-ADM-07).
- Los casos R-01..R-29 de `docs/testing/matriz-trazabilidad.md` §4 quedan cubiertos, salvo los que dependen explícitamente de EP-05 (ver siguiente sección).
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance, sección 4.

## Alcance explícitamente fuera de EP-04

Clasificado como **fase posterior** o **fuera de alcance** en la matriz de alcance §4 (no se implementa):

- Lista de espera para recursos ocupados (fase posterior).
- Check-in por código QR (fase posterior).
- Reservas recurrentes o suscripción a horarios fijos (fase posterior).
- Cobro por reserva de invitados externos (fuera de alcance).

Pertenece al MVP pero se entrega en otras épicas (no en EP-04):

- **Módulo de notificaciones** (`RESERVATION_CONFIRMED`, `RESERVATION_CANCELLED`, `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_MAINTENANCE`, `RESERVATION_REMINDER`, por bandeja interna y correo): EP-05. En EP-04 los eventos se disparan según el contrato y se deja el rastro previsto, sin construir el módulo. Los casos R-21 y el recordatorio de reserva se cierran allí.
- **Dashboard del socio** (`GET /dashboard/member`, con `canReserve` y `upcomingReservations`): EP-07. EP-04 entrega las reservas y la regla de elegibilidad sobre las que ese dashboard se construye; el caso DA-01 se cierra allí.
- **Métricas de reservas y ocupación** del dashboard administrativo (RN-ANL-03/04/05/07): EP-07.

## Dependencias con épicas anteriores

| Dependencia                                                                                                                        | Origen | Estado                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| El socio existe como cuenta digital con `memberStatus` y sesión Cognito con rol `member`/`admin`                                   | EP-02  | Disponible (Sprint 1 cerrado)                                                                                                    |
| El socio puede llegar a `memberStatus=ACTIVE` pagando su membresía; `membershipStatus` y `outstandingBalance` reflejan la realidad | EP-03  | Disponible (Sprint 2 cerrado); es la precondición dura de RN-RES-12: **sin EP-03 no hay ningún socio habilitado a reservar**     |
| El guard de frontend `RequireActiveMember` protege el área de socio                                                                | EP-02  | Disponible; EP-04 lo reutiliza, no lo reemplaza                                                                                  |
| La auditoría administrativa (`AuditLog`) y el middleware `requireRole` ya existen                                                  | EP-02  | Disponible; EP-04 agrega las acciones `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_UPDATED`, `RESOURCE_MAINTENANCE` |

## Decisiones funcionales resueltas (cerradas antes de implementar)

Las tres decisiones que la planificación dejó abiertas están cerradas. Ninguna amplía el alcance del MVP: cierran ambigüedades del contrato y del modelo para no improvisar durante el sprint.

1. **Identificación del socio participante — resuelta** ([ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)). Se agrega `GET /members/lookup?dni=` (member, admin), de **coincidencia exacta**, que devuelve solo `memberId`, `firstName` y `lastName`; 404 `DNI_NOT_FOUND` si el DNI no existe o pertenece a un socio `PENDING`/`REJECTED`. Se descartó sobrecargar `GET /members` con un querystring `dni` y una respuesta distinta por rol: un fallo en la comprobación de rol expondría el padrón completo. Ver US-031 y contrato §4.
2. **Carga del catálogo de recursos — resuelta** ([ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md)). El catálogo se gestiona como **ítems estáticos de Terraform** (`aws_dynamodb_table_item`, uno por recurso), versionado con el resto de la infraestructura; no hay endpoint de alta ni Lambda de _seed_. Terraform manda sobre `resourceId`, `type`, `name`, `blockMinutes` y `requiresApproval`; el administrador manda en runtime sobre `capacity`, `opensAt`, `closesAt` y `resourceStatus`, y un `apply` posterior no los revierte. Ver US-028.
3. **Efecto del mantenimiento sobre reservas existentes — confirmada.** El bloqueo **no cancela** automáticamente las reservas ya creadas: impide reservas nuevas en toda la ventana e informa al administrador cuántas quedan afectadas (`affectedReservationCount`) para que decida. Además, la franja bloqueada se devuelve explícitamente como **`status=MAINTENANCE`** en la disponibilidad, distinta de una franja ocupada por otra reserva. Ver US-029, US-030 y US-035.

Decisión adicional derivada de la primera, del mismo ADR-0009: el **invitado externo pasa a tener perfil persistente** (`GuestProfile`, modelo §3.15), resoluble con `GET /guests/lookup?dni=` y creado por _upsert_ idempotente dentro de la transacción de la reserva (gana el primer registro si dos socios escriben nombres distintos para el mismo DNI). Sin esto, cada reserva obligaba a retipear al invitado y el mismo DNI podía figurar con nombres distintos.

## Historial de cambios

- 2026-08-09: Creación de la épica EP-04 y asociación de las historias del Sprint 3 (US-027..US-036).
- 2026-08-09: Cierre de las tres decisiones funcionales pendientes (ADR-0009 y ADR-0010); alta de la entidad `GuestProfile`, de los endpoints de resolución por DNI y del estado por franja en la disponibilidad.
