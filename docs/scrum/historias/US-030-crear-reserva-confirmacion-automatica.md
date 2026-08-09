# US-030 — Reservar una instalación con validación completa en servidor

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-030                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend                                            |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Crítica                                            |
| Estimación relativa | 8                                                  |
| Dependencias        | US-028                                             |

## Historia

Como **socio activo y al día**, quiero **reservar una instalación en una franja disponible y que el sistema garantice que nadie más la tiene**, para **usar el club con la certeza de que mi reserva es válida y no se solapa con otra**.

> Esta historia entrega el **comportamiento de servidor** de la creación de reserva y todas sus reglas excepto las de participantes, que son US-031. La experiencia de reserva del socio es US-032. Las tres se desarrollan contra el contrato ya definido.

## Contrato de API

`POST /reservations` (member), según `docs/api/contratos-api.md` §7. Request: `resourceId`, `startsAt`, `participants[]`, `notes` (opcional). Response 201 con `reservationId`, `resourceId`, `reservationStatus`, `startsAt`, `endsAt`, `participantCount`, `guestCount`. Esquema versionado: `createReservationSchema` en `packages/validation`. La forma de `participants[]` y el alta implícita de invitados externos son alcance de US-031.

## Reglas de negocio

RN-RES-01 (confirmación automática), RN-RES-02 (aprobación para parrillas y salón), RN-RES-06 (titular responsable), RN-RES-07 (sin cruces por recurso), RN-RES-09 (aforo), RN-RES-11 (mantenimiento), RN-RES-12 y RN-PAG-06 (solo socios activos y sin deuda), horarios mock por recurso. Modelo de datos: [§3.8 `Reservation`](../../data/modelo-dynamodb.md) y consulta 19 sobre GSI3.

## Valor de negocio

Es el corazón de EP-04 y el punto donde el sistema demuestra que las reglas se cumplen **en el servidor y bajo concurrencia**, no en la pantalla. También cierra el vacío heredado de las dos épicas anteriores: hasta hoy, ni el socio pendiente (A-11), ni el aprobado sin pagar (A-15), ni el socio con deuda (P-10) tenían un lugar real donde ser bloqueados, porque `POST /reservations` no existía.

## Precondiciones

- El socio tiene sesión iniciada con rol `member`.
- El catálogo de recursos existe (US-028).
- El recurso solicitado existe y la franja pedida está libre en el momento de la petición.

## Postcondiciones

- Si la reserva se acepta: existe un ítem `Reservation` con su estado inicial (`CONFIRMED` o `PENDING_APPROVAL`), su ventana `startsAt`/`endsAt`, el titular como `holderMemberId`, un participante `HOLDER` asociado y los contadores `participantCount`/`guestCount` coherentes.
- Si la reserva se rechaza por cualquier regla: no queda ningún ítem parcial, ningún contador de invitado incrementado y ninguna franja bloqueada.

## Reglas de resolución (funcionales)

- El **titular** es siempre el socio autenticado; nunca se acepta un titular enviado por el cliente (RN-RES-06).
- `endsAt` lo calcula el servidor como `startsAt + blockMinutes` del recurso; nunca se acepta un `endsAt` del cliente.
- El estado inicial lo determina el `requiresApproval` del recurso: `CONFIRMED` para fútbol, tenis, pádel y piscina; `PENDING_APPROVAL` para parrillas y salón social (RN-RES-01/02).
- Una reserva `PENDING_APPROVAL` **ocupa la franja** desde su creación (aclaración funcional de RN-RES-07: si no la ocupara, dos reservas pendientes del mismo recurso y horario podrían aprobarse ambas).
- Se consideran **activas** para el cálculo de cruces las reservas `CONFIRMED`, `PENDING_APPROVAL` y `APPROVED`; las `CANCELLED` y `REJECTED` no bloquean.
- El aforo se compara contra `capacity` del recurso e incluye al titular (`participantCount` incluye al `HOLDER`, según el diccionario de datos).

## Criterios de aceptación

1. `POST /reservations` de un socio `ACTIVE` sin deuda, sobre un recurso existente y una franja válida y libre, crea la reserva y responde 201 con `reservationId`, `resourceId`, `reservationStatus`, `startsAt`, `endsAt`, `participantCount` y `guestCount`.
2. La reserva de un recurso de tipo `FUTBOL`, `TENIS`, `PADEL` o `PISCINA` queda `reservationStatus=CONFIRMED` de inmediato (RN-RES-01).
3. La reserva de un recurso de tipo `PARRILLA` o `SALON_SOCIAL` queda `reservationStatus=PENDING_APPROVAL` y **no** se confirma sola (RN-RES-02).
4. El socio autenticado queda registrado como `holderMemberId` y como participante `HOLDER` de la reserva (RN-RES-06).
5. `endsAt` es exactamente `startsAt + blockMinutes` del recurso; un `startsAt` que no coincide con el inicio de una franja válida del recurso devuelve 422 `OUTSIDE_SCHEDULE`.
6. Una reserva fuera del horario del recurso (antes de `opensAt` o que termina después de `closesAt`, en hora local del club) devuelve 422 `OUTSIDE_SCHEDULE`.
7. Una reserva que se cruza con otra reserva activa del mismo recurso devuelve 409 `RESERVATION_OVERLAP` y no crea nada (RN-RES-07).
8. Una reserva cuyo total de participantes supera el `capacity` del recurso devuelve 422 `CAPACITY_EXCEEDED` (RN-RES-09).
9. Una reserva que se solapa con un bloqueo de mantenimiento, o sobre un recurso con `resourceStatus=MAINTENANCE`, devuelve 409 `RESOURCE_IN_MAINTENANCE` (RN-RES-11). Aplica **aunque la franja no tenga ninguna otra reserva** y aunque existan reservas anteriores en esa misma franja (que no se cancelan solas, US-035): mientras el bloqueo esté vigente no se crea ninguna reserva nueva sobre él.
10. Un socio cuyo `memberStatus` no es `ACTIVE` (`MIGRATED`, `PENDING`, `APPROVED`, `REJECTED`) recibe 422 `MEMBERSHIP_REQUIRED` y no crea reserva (RN-RES-12; cierra A-11 y A-15).
11. Un socio `ACTIVE` cuyo `membershipStatus` es `DEBT` o `EXPIRED`, o cuyo `outstandingBalance` es mayor que cero, recibe 422 `MEMBER_HAS_DEBT` y no crea reserva (RN-PAG-06, RN-RES-12; cierra P-10).
12. Un `resourceId` inexistente devuelve 404 `NOT_FOUND`; un cuerpo que no cumple el esquema devuelve 400 `VALIDATION_ERROR`.
13. La reserva y sus ítems asociados se escriben de forma **atómica**: ante cualquier fallo intermedio no queda una reserva sin participantes ni participantes sin reserva.
14. Dos peticiones concurrentes por la misma franja del mismo recurso terminan con **una sola** reserva creada; la otra recibe 409 `RESERVATION_OVERLAP`.
15. Toda regla anterior se valida en el backend aunque el frontend ya la haya anticipado; ninguna depende del cliente.
16. La reserva creada deja el rastro necesario para disparar el evento de notificación `RESERVATION_CONFIRMED` previsto por el contrato, sin construir el módulo de notificaciones (EP-05).

## Casos alternativos / excepciones

- **Franja tomada entre la consulta y la confirmación**: 409 `RESERVATION_OVERLAP`; la interfaz refresca disponibilidad (US-029/US-032).
- **Socio con deuda que consulta disponibilidad**: puede ver las franjas, pero al confirmar recibe `MEMBER_HAS_DEBT`; la interfaz lo anticipa con un aviso y un acceso al pago (US-032).
- **Reserva sin participantes adicionales**: es válida; el titular solo se reserva para sí mismo y `participantCount=1`, `guestCount=0`.
- **Reserva en el pasado o para el mismo instante**: se rechaza como 422 `OUTSIDE_SCHEDULE` (una franja ya iniciada no es reservable).
- **Reserva que cruza el cierre del recurso** (por ejemplo, parrilla de 5 horas iniciada a las 20:00 con cierre a las 22:00): se rechaza con `OUTSIDE_SCHEDULE`.
- **Recurso puesto en mantenimiento entre la consulta y la confirmación**: 409 `RESOURCE_IN_MAINTENANCE`; la interfaz refresca la disponibilidad, donde la franja aparece ahora con `status=MAINTENANCE` (US-029) y no como "ocupada".

## Sugerencia de pruebas funcionales

- R-01: reserva de fútbol/tenis/pádel/piscina con disponibilidad → `CONFIRMED`.
- R-03: reserva con cruce en el mismo recurso → 409 `RESERVATION_OVERLAP`.
- R-04: participantes por encima del aforo → 422 `CAPACITY_EXCEEDED`.
- R-09: el titular queda como `HOLDER` responsable.
- R-10: reserva fuera de horario → 422 `OUTSIDE_SCHEDULE` (probar también el borde: bloque que excede `closesAt`).
- R-11: reserva de parrilla o salón → `PENDING_APPROVAL`.
- R-19: socio no `ACTIVE` o con deuda → `MEMBERSHIP_REQUIRED` / `MEMBER_HAS_DEBT`.
- P-10 (cierre del caso heredado de EP-03): socio con deuda o vencido no puede reservar.
- Concurrencia: dos peticiones simultáneas por la misma franja → una sola reserva.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-01/02/06/07/09/11/12, RN-PAG-06, horarios mock.
- Casos de prueba: R-01, R-03, R-04, R-09, R-10, R-11, R-19; cierra P-10 (§3) y contribuye a A-11 y A-15 (§2).
- Depende de: US-028.
- Habilita: US-031, US-032, US-033, US-034, US-036.
