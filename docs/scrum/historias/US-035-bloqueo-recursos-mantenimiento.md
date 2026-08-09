# US-035 — Bloquear temporalmente un recurso por mantenimiento

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-035                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + Frontend                                 |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Media                                              |
| Estimación relativa | 3                                                  |
| Dependencias        | US-028, US-029                                     |

## Historia

Como **administrador**, quiero **bloquear una instalación durante una franja de tiempo por mantenimiento y liberarla cuando termine**, para **evitar que los socios reserven un espacio que no estará operativo**.

## Contrato de API

`POST /resources/{resourceId}/maintenance` y `DELETE /resources/{resourceId}/maintenance/{blockId}` (admin), según `docs/api/contratos-api.md` §6. Request de creación: `{ startsAt, endsAt, reason }` → 201. Esquema ya versionado: `createMaintenanceSchema` en `packages/validation`. Modelo: [§3.11 `MaintenanceBlock`](../../data/modelo-dynamodb.md), que comparte el índice GSI3 con las reservas.

## Reglas de negocio

RN-RES-11 (el administrador puede bloquear temporalmente recursos por mantenimiento), RN-ADM-04 (gestión de recursos y mantenimiento), RN-RES-07 (el bloqueo colisiona con las reservas del recurso). Auditoría `RESOURCE_MAINTENANCE` (ADR-0008).

## Valor de negocio

Una cancha inundada, una piscina en limpieza o una parrilla en reparación no deben poder reservarse. Sin esta historia, la única alternativa del club sería cancelar reservas una por una después de que los socios ya las hicieron, con el costo de confianza que eso implica.

## Precondiciones

- El catálogo de recursos existe (US-028) y el cálculo de disponibilidad está operativo (US-029).
- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Al crear el bloqueo: existe un ítem `MaintenanceBlock` con su ventana, motivo y administrador que lo creó; la franja deja de estar disponible y no admite reservas nuevas.
- Al liberar el bloqueo: el ítem deja de tener efecto y la franja vuelve a estar disponible.
- Ambas acciones quedan auditadas.

## Criterios de aceptación

1. `POST /resources/{resourceId}/maintenance` con `startsAt`, `endsAt` y un motivo crea el bloqueo y responde 201 con su `blockId`.
2. Un `endsAt` anterior o igual a `startsAt`, o un cuerpo que no cumple el esquema, devuelve 400 `VALIDATION_ERROR`.
3. Un `resourceId` inexistente devuelve 404 `NOT_FOUND`.
4. Mientras el bloqueo existe, las franjas del recurso solapadas por su ventana se devuelven con `available=false` en `GET /resources/{id}/availability` (RN-RES-11).
5. Un intento de crear una reserva que se solapa con el bloqueo devuelve 409 `RESOURCE_IN_MAINTENANCE` y no crea nada (RN-RES-11, US-030).
6. `DELETE /resources/{resourceId}/maintenance/{blockId}` elimina el bloqueo y responde 200/204; a partir de ese momento la franja vuelve a estar disponible y admite reservas.
7. Eliminar un `blockId` inexistente o ya eliminado devuelve 404 `NOT_FOUND` sin efectos.
8. Un usuario con rol `member` que llama a cualquiera de los dos endpoints recibe 403 `FORBIDDEN`.
9. Ambas acciones quedan registradas en `AuditLog` con actor, acción `RESOURCE_MAINTENANCE`, recurso objetivo, ventana y marca de tiempo.
10. Las reservas **ya existentes** dentro de la ventana bloqueada **no** se cancelan automáticamente: el bloqueo impide reservas nuevas, y el administrador decide si cancela las existentes (puede hacerlo sin la restricción de 24 horas, US-036). Esta decisión se documenta explícitamente en la interfaz administrativa.
11. Al crear un bloqueo que se solapa con reservas existentes, la respuesta o la interfaz informa al administrador **cuántas reservas** quedan afectadas, para que pueda decidir.
12. El bloqueo deja el rastro necesario para disparar el evento `RESOURCE_MAINTENANCE` hacia los socios con reserva en ese recurso y franja, previsto por el contrato, sin construir el módulo de notificaciones (EP-05).
13. En la interfaz administrativa, el administrador puede crear un bloqueo eligiendo recurso, rango de fechas/horas y motivo, ver los bloqueos vigentes de cada recurso y liberarlos, con confirmación explícita.

## Casos alternativos / excepciones

- **Bloqueo indefinido de un recurso completo**: se logra poniendo `resourceStatus=MAINTENANCE` con `PATCH /resources/{resourceId}` (US-036); el `MaintenanceBlock` es para ventanas acotadas. Los dos mecanismos coexisten y ambos hacen que el recurso no sea reservable; la interfaz debe dejar claro cuál está aplicando.
- **Bloqueos solapados sobre el mismo recurso**: se admiten; el efecto es la unión de las ventanas y liberar uno no libera el otro.
- **Bloqueo en el pasado**: se admite por trazabilidad, pero no tiene efecto sobre reservas futuras.
- **Reserva existente dentro de la ventana bloqueada**: sigue vigente hasta que el administrador la cancele; el club debe avisar al socio (EP-05).

## Sugerencia de pruebas funcionales

- R-20: crear un bloqueo → la franja deja de estar disponible y una reserva nueva devuelve `RESOURCE_IN_MAINTENANCE`.
- R-22: liberar el bloqueo → la franja vuelve a estar disponible y admite reserva.
- R-21 (queda para EP-05): el bloqueo dispara la notificación `RESOURCE_MAINTENANCE` a los socios con reserva en ese recurso.
- AD-05 (parcial): la acción `RESOURCE_MAINTENANCE` queda en `AuditLog`.
- AD-06: un `member` no puede crear ni liberar bloqueos.
- Validación: `endsAt` anterior a `startsAt` → 400.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-07, RN-RES-11, RN-ADM-04, ADR-0008.
- Casos de prueba: R-20, R-22; AD-05 (parcial), AD-06. R-21 queda explícitamente para EP-05.
- Depende de: US-028, US-029.
- Habilita: US-036 (gestión completa de recursos), EP-05 (evento `RESOURCE_MAINTENANCE`).
