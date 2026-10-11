# US-044 — Notificar los cambios de estado de una reserva

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-044                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 3                                          |
| Dependencias        | US-040                                     |

## Historia

Como **socio titular de una reserva**, quiero **recibir un aviso cuando mi reserva se confirma, se aprueba, se rechaza o se cancela**, para **saber con certeza si tengo el espacio y organizarme con mis acompañantes**.

## Contrato de API

Sin endpoints nuevos. Efecto lateral de `POST /reservations` (`RESERVATION_CONFIRMED`), `POST /reservations/{id}/approve` (`RESERVATION_APPROVED`), `POST /reservations/{id}/reject` (`RESERVATION_REJECTED`) y `POST /reservations/{id}/cancel` (`RESERVATION_CANCELLED`), según `docs/api/contratos-api.md` §7. Las respuestas no cambian.

## Reglas de negocio

RN-NOT-04 (reserva confirmada, cancelada, aprobada o rechazada), RN-RES-01/02, RN-RES-06 (el titular es el responsable), RN-RES-10.

## Valor de negocio

Las parrillas y el salón social dependen de una decisión del administrador que puede tardar días; sin aviso, el socio tiene que entrar a revisar. Y cuando un administrador cancela una reserva, el socio hoy no se entera.

## Precondiciones

- US-040 disponible. Reservas operativas (EP-04).

## Postcondiciones

- Cada transición exitosa de una reserva deja un aviso al **titular**.

## Criterios de aceptación

1. Una reserva creada con confirmación automática (`CONFIRMED`) emite `RESERVATION_CONFIRMED` al titular con instalación, fecha y hora de inicio y fin en hora de Lima.
2. Una reserva aprobada por el administrador emite `RESERVATION_APPROVED` al titular.
3. Una reserva rechazada emite `RESERVATION_REJECTED` al titular con el motivo registrado.
4. Una reserva cancelada emite `RESERVATION_CANCELLED` al titular. Si la canceló un administrador, el texto lo dice explícitamente; si la canceló el propio socio, el aviso sirve de constancia.
5. Una reserva creada como `PENDING_APPROVAL` no emite aviso: ese estado no está en el catálogo de eventos (ver pregunta abierta 5 de EP-05). La interfaz de reserva ya le informa al socio que quedó pendiente.
6. Una operación que falla (cruce, aforo, deuda, `CANCELLATION_TOO_LATE`, `RESERVATION_NOT_PENDING`, etc.) no emite ningún aviso.
7. Los avisos van solo al titular. Los socios participantes y los invitados externos no reciben avisos en el MVP (ver pregunta abierta 4 de EP-05).
8. El texto no incluye datos de los participantes (ni nombres ni DNI) ni datos del administrador que decidió.
9. Un fallo de correo o de bandeja no cambia la respuesta de la operación de reserva (US-040).

## Casos alternativos / excepciones

- **Dos administradores deciden a la vez sobre la misma reserva**: el que recibe 409 `RESERVATION_NOT_PENDING` no emite aviso; el socio recibe uno solo.
- **Cancelación de una reserva ya cancelada** (409 `CONFLICT`): sin aviso.

## Sugerencia de pruebas funcionales

- Reserva de cancha → `RESERVATION_CONFIRMED` al titular.
- Parrilla aprobada / rechazada con motivo → aviso correspondiente (enlaza R-12, R-13).
- Cancelación por el socio y por el administrador → `RESERVATION_CANCELLED` con el texto adecuado en cada caso (enlaza R-15, R-17).
- Reserva rechazada por cruce → sin aviso.
- Un socio participante no recibe el aviso de la reserva de otro.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-04, RN-RES-01/02/06/10.
- Casos de prueba: N-11 (eventos de reserva); parte de notificación de R-12 y R-13.
- Depende de: US-040.
- Habilita: cierre de los eventos de reserva pendientes del Sprint 3.
