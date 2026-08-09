# US-034 — Aprobar o rechazar reservas de parrillas y salón social

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-034                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + Frontend                                 |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Alta                                               |
| Estimación relativa | 5                                                  |
| Dependencias        | US-030                                             |

## Historia

Como **administrador**, quiero **revisar las solicitudes de parrillas y salón social y aprobarlas o rechazarlas con un motivo**, para **controlar el uso de los espacios que requieren preparación del club y dejar constancia de la decisión**.

## Contrato de API

`POST /reservations/{reservationId}/approve` y `POST /reservations/{reservationId}/reject` (admin), según `docs/api/contratos-api.md` §7. `reject` recibe `{ "reason": "..." }`. Ambas se auditan. La bandeja de pendientes se obtiene con `GET /reservations?scope=all&status=PENDING_APPROVAL`. Esquema ya versionado: `rejectReservationSchema` en `packages/validation`.

## Reglas de negocio

RN-RES-02 (parrillas y salón social requieren aprobación administrativa), RN-ADM-05 (el administrador consulta, aprueba o rechaza esas reservas), RN-RES-05 (cupo mensual de invitados), RN-RES-07 (la franja no puede quedar duplicada). Auditoría según [ADR-0008](../../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md), acciones `RESERVATION_APPROVED` y `RESERVATION_REJECTED` del diccionario de datos. Modelo: consulta 17 sobre GSI2 (`RESERVATION#STATUS#PENDING_APPROVAL`).

## Valor de negocio

Las parrillas y el salón social no son canchas: implican limpieza, montaje y responsabilidad sobre un evento. El club necesita decidir caso por caso, y necesita poder demostrar quién decidió qué y por qué. Sin esta historia, las reservas de esos espacios quedan colgadas en `PENDING_APPROVAL` para siempre y esos dos recursos son inutilizables.

## Precondiciones

- Existen reservas en estado `PENDING_APPROVAL` creadas por socios (US-030).
- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Al aprobar: la reserva queda `APPROVED`, mantiene ocupada la franja y queda registrada la acción en `AuditLog`.
- Al rechazar: la reserva queda `REJECTED` con su `rejectionReason`, la franja se libera, el cupo mensual de los invitados externos se devuelve y la acción queda auditada.

## Criterios de aceptación

1. El administrador puede listar las reservas `PENDING_APPROVAL` con su recurso, fecha y hora, socio titular, cantidad de participantes e invitados, ordenadas por fecha de inicio.
2. `POST /reservations/{reservationId}/approve` sobre una reserva `PENDING_APPROVAL` la deja en `APPROVED` y responde 200 con el estado nuevo (RN-RES-02).
3. `POST /reservations/{reservationId}/reject` con un `reason` válido la deja en `REJECTED`, persiste el motivo en `rejectionReason` y responde 200.
4. Un `reject` sin motivo, o con un motivo que no cumple el esquema, devuelve 400 `VALIDATION_ERROR` y no cambia el estado.
5. Aprobar o rechazar una reserva que **no** está en `PENDING_APPROVAL` (ya aprobada, rechazada, cancelada o confirmada automáticamente) devuelve 409 `RESERVATION_NOT_PENDING` y no cambia nada.
6. Una reserva de fútbol, tenis, pádel o piscina nunca aparece en la bandeja de pendientes: esos recursos se confirman solos (RN-RES-01).
7. Un usuario con rol `member` que llama a `approve` o `reject` recibe 403 `FORBIDDEN`.
8. Al aprobar, la reserva **sigue ocupando** la franja que ya tenía tomada desde su creación; la aprobación no puede generar un cruce con otra reserva del mismo recurso (RN-RES-07).
9. Al rechazar, la franja se libera y vuelve a aparecer disponible en `GET /resources/{id}/availability`.
10. Al rechazar, el contador mensual de cada invitado externo de esa reserva se **decrementa**: un invitado no pierde una de sus dos visitas del mes por una reserva que el club nunca aprobó (RN-RES-05).
11. Toda aprobación y todo rechazo se registran en `AuditLog` con actor, acción (`RESERVATION_APPROVED` / `RESERVATION_REJECTED`), reserva objetivo y marca de tiempo.
12. Ambas acciones dejan el rastro necesario para disparar los eventos `RESERVATION_APPROVED` y `RESERVATION_REJECTED` previstos por el contrato, sin construir el módulo de notificaciones (EP-05).
13. En la interfaz administrativa, la bandeja muestra la cantidad de solicitudes pendientes, permite ver el detalle de cada una (participantes incluidos) y ejecutar aprobar o rechazar con confirmación explícita; el rechazo exige escribir el motivo.
14. El socio titular ve el estado resultante y el motivo de rechazo en su listado de reservas (US-033).

## Casos alternativos / excepciones

- **Solicitud cancelada por el socio antes de la decisión**: queda `CANCELLED`; un intento posterior de aprobar o rechazar devuelve 409 `RESERVATION_NOT_PENDING`.
- **Dos administradores deciden a la vez sobre la misma solicitud**: solo la primera decisión prospera; la segunda recibe 409 `RESERVATION_NOT_PENDING`.
- **Solicitud cuya fecha ya pasó sin decisión**: en el MVP no se resuelve automáticamente; queda visible como pendiente vencida para que el administrador la cierre. Una expiración automática sería alcance nuevo.
- **Recurso puesto en mantenimiento mientras la solicitud está pendiente**: el administrador puede rechazarla con ese motivo; el sistema no la rechaza solo.

## Sugerencia de pruebas funcionales

- R-12: aprobación de una parrilla → `APPROVED` + auditoría.
- R-13: rechazo con motivo → `REJECTED` + `rejectionReason` + auditoría.
- R-14: aprobar o rechazar una reserva no pendiente → 409 `RESERVATION_NOT_PENDING`.
- R-29: el rechazo libera la franja y devuelve el cupo mensual de los invitados externos.
- AD-05 (parcial): las acciones `RESERVATION_APPROVED` y `RESERVATION_REJECTED` quedan en `AuditLog`.
- AD-06: un `member` no puede aprobar ni rechazar.
- Concurrencia: dos administradores aprobando la misma solicitud → una sola decisión efectiva.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-02, RN-RES-05, RN-RES-07, RN-ADM-05, ADR-0008.
- Casos de prueba: R-12, R-13, R-14, R-29; AD-05 (parcial), AD-06.
- Depende de: US-030 (y de US-031 para la devolución del cupo de invitados).
- Habilita: EP-07 (métrica "reservas pendientes de aprobación", RN-ANL-05).
