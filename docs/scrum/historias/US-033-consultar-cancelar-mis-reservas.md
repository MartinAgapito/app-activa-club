# US-033 — Consultar y cancelar mis reservas

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-033                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + Frontend                                 |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Alta                                               |
| Estimación relativa | 5                                                  |
| Dependencias        | US-030                                             |

## Historia

Como **socio**, quiero **ver mis reservas con su estado y cancelar las que ya no voy a usar**, para **liberar la instalación a tiempo y tener control sobre mis compromisos con el club**.

## Contrato de API

`GET /reservations?scope=me&status=&resourceId=&from=&to=`, `GET /reservations/{reservationId}` y `POST /reservations/{reservationId}/cancel` (member), según `docs/api/contratos-api.md` §7. La cancelación responde 200 con `{ reservationId, reservationStatus: "CANCELLED" }`. Esquemas ya versionados: `listReservationsQuerySchema` y `cancelReservationSchema` en `packages/validation`. El listado sigue la convención de paginación por cursor de §1 (`{ items, nextCursor }`).

## Reglas de negocio

RN-RES-10 (cancelación hasta 24 horas antes del inicio), RN-RES-05 (devolución del cupo mensual del invitado al cancelar), RN-RES-06 (el titular es el responsable de la reserva). Modelo de datos: consulta 12 sobre GSI1 (`MEMBER#<id>` + `begins_with(GSI1SK,"RES#")`).

## Valor de negocio

Sin esta historia, una reserva es un compromiso irreversible y una instalación reservada por error queda bloqueada para todo el club. La ventana de 24 horas es lo que hace que la cancelación sea útil para el club (da tiempo a que otro socio use la franja) y responsable para el socio.

## Precondiciones

- El socio tiene sesión iniciada con rol `member`.
- Existen reservas creadas por él (US-030).

## Postcondiciones

- Al cancelar: la reserva queda `reservationStatus=CANCELLED` con su `cancelledAt`, la franja se libera para nuevas reservas, y el cupo mensual de cada invitado externo de esa reserva se devuelve.
- La cancelación no elimina la reserva: queda en el historial con su estado final.

## Criterios de aceptación

1. `GET /reservations?scope=me` devuelve únicamente las reservas donde el socio autenticado es el **titular**, ordenadas por fecha de inicio y paginadas con `{ items, nextCursor }`.
2. El listado admite filtrar por `status`, `resourceId` y rango `from`/`to`, y distingue próximas de pasadas.
3. `GET /reservations/{reservationId}` de una reserva propia devuelve su detalle: recurso, ventana horaria, estado, participantes (socios e invitados), motivo de rechazo si existe y momento de cancelación si existe.
4. Un socio que consulta el detalle de una reserva de la que **no** es titular recibe 403 `FORBIDDEN` o 404 `NOT_FOUND`, sin filtrar información de la reserva ajena.
5. `POST /reservations/{reservationId}/cancel` sobre una reserva propia con más de 24 horas de anticipación respecto de `startsAt` la deja en `CANCELLED` y responde 200 (RN-RES-10).
6. La misma llamada a menos de 24 horas del inicio devuelve 422 `CANCELLATION_TOO_LATE` y **no** cambia el estado (RN-RES-10). El corte se evalúa en zona `America/Lima`.
7. Cancelar una reserva `PENDING_APPROVAL` es válido para el socio (no necesita esperar la decisión del administrador), sujeto a la misma ventana de 24 horas.
8. Cancelar una reserva ya `CANCELLED` o `REJECTED` devuelve 409 `CONFLICT` y no vuelve a tocar contadores ni estados.
9. Un socio que intenta cancelar una reserva de la que no es titular recibe 403 `FORBIDDEN` o 404 `NOT_FOUND` y la reserva no cambia.
10. La cancelación **decrementa el contador mensual** de cada invitado externo que formaba parte de la reserva y quita la reserva de sus `reservationIds`, de forma atómica junto al cambio de estado (RN-RES-05).
11. Tras la cancelación, la franja vuelve a aparecer disponible en `GET /resources/{id}/availability` y admite una reserva nueva.
12. La cancelación deja el rastro necesario para disparar el evento `RESERVATION_CANCELLED` previsto por el contrato, sin construir el módulo de notificaciones (EP-05).
13. En la interfaz, el socio ve sus reservas próximas y pasadas con su estado (`CONFIRMED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`), y el botón de cancelar solo aparece habilitado cuando la cancelación es posible; si no lo es, se explica el motivo ("faltan menos de 24 horas").
14. La cancelación desde la interfaz pide confirmación explícita antes de ejecutarse y muestra el resultado, incluidos los errores del contrato.

## Casos alternativos / excepciones

- **Reserva a exactamente 24 horas del inicio**: se define el borde como **permitida** cuando faltan 24 horas o más; a partir de 23:59 restantes se rechaza. El criterio debe quedar cubierto por una prueba de borde explícita.
- **Reserva rechazada por el administrador**: aparece en el listado como `REJECTED` con su motivo, y no admite cancelación.
- **Reserva ya iniciada o pasada**: no admite cancelación (cae en `CANCELLATION_TOO_LATE`).
- **Socio invitado por otro socio**: en el MVP solo el titular ve y cancela la reserva; los participantes no la ven en su listado. Ampliar esto (que un participante vea las reservas donde fue invitado) sería alcance nuevo y requiere aprobación del product owner.
- **Cancelación administrativa**: el administrador puede cancelar sin la restricción de 24 horas; se cubre en US-036.

## Sugerencia de pruebas funcionales

- R-15: cancelación con más de 24 horas de anticipación → `CANCELLED`.
- R-16: cancelación con menos de 24 horas → 422 `CANCELLATION_TOO_LATE` (más prueba de borde exacta en 24 horas).
- R-18: cancelación de una reserva con invitados → contador mensual decrementado y el invitado puede volver a ser invitado ese mes.
- R-25: el socio solo ve sus propias reservas en `scope=me` y no accede al detalle de una ajena.
- R-26: un socio no puede cancelar la reserva de otro socio.
- R-28: cancelar una reserva ya cancelada o rechazada → 409 `CONFLICT`.
- Tras cancelar, la franja vuelve a ofrecerse como disponible (enlaza con R-02).

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-05, RN-RES-06, RN-RES-10.
- Casos de prueba: R-15, R-16, R-18, R-25, R-26, R-28.
- Depende de: US-030 (y de US-031 para la devolución del cupo de invitados).
- Habilita: US-036 (consola administrativa de reservas reutiliza el mismo listado), EP-07 (próximas reservas del dashboard del socio).
