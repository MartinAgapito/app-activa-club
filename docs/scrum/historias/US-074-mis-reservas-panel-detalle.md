# US-074 — Consultar mis reservas en pestañas con panel de detalle y cancelación

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-074                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-062, US-063, US-064, US-065, US-066                   |

## Contexto

`/socio/reservas/mias` (`MyReservationsPage`, US-033) muestra dos secciones apiladas, "Próximas" y "Pasadas", con tarjetas (`MyReservationCard`) y un `ConfirmDialog` para cancelar. El detalle con participantes (`GET /reservations/{id}`) no se ve en ningún lugar de la interfaz.

## Historia

Como **socio**, quiero **ver mis reservas próximas y pasadas por separado, abrir el detalle de una con sus participantes y cancelarla desde ahí**, para **revisar y gestionar mis reservas sin desplazarme por una lista larga**.

## Contrato de API

`GET /reservations?scope=me`, `GET /reservations/{reservationId}` y `POST /reservations/{reservationId}/cancel` (§7). Sin cambios en el servidor.

## Reglas de negocio

RN-RES-06 (solo las reservas donde es titular), RN-RES-10 (cancelación hasta 24 horas antes).

## Valor de negocio

Hace visible información que hoy existe en el servidor pero no en pantalla (participantes, motivo de rechazo) y reduce la cancelación a dos clics claros.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Si cancela: la reserva queda `CANCELLED` (US-033).

## Criterios de aceptación

1. La pantalla tiene dos pestañas (US-064), **Próximas** y **Pasadas**, con su contador; la pestaña activa se guarda en la URL.
2. Cada pestaña lista las reservas en la tabla de US-065 con instalación, fecha y franja en hora de Lima, estado con etiqueta en español y cantidad de participantes; "Próximas" en orden ascendente y "Pasadas" en orden descendente.
3. Al activar una fila se abre un panel lateral (US-063) con el detalle de `GET /reservations/{id}`: instalación (nombre tomado del catálogo `GET /resources`), fecha y franja, estado, participantes (el titular; los invitados con su nombre; los socios participantes como "Socio del club", porque el contrato solo devuelve su `memberId`), motivo de rechazo y momento de cancelación cuando existan. Ningún DNI se muestra completo.
4. El panel tiene dirección propia (`?reserva=<reservationId>`): "atrás" lo cierra y la dirección abre la reserva directamente.
5. El botón "Cancelar reserva" está en el pie del panel y solo se habilita cuando la cancelación es posible; si no, se explica el motivo ("Faltan menos de 24 horas", "Ya está cancelada") (US-033, criterio 13).
6. "Cancelar reserva" abre una confirmación en ventana (US-062) con el resumen de la reserva; al confirmar, la reserva pasa a cancelada **sin recargar la página**, el panel muestra el nuevo estado y aparece el aviso efímero "Reserva cancelada" (US-066).
7. Los errores del servidor al cancelar (`CANCELLATION_TOO_LATE`, `CONFLICT`) se muestran traducidos dentro de la confirmación, sin cerrarla.
8. Un acceso "Nueva reserva" abre el asistente de US-072.
9. Estados de carga, error y vacío por pestaña ("No tienes reservas próximas" con invitación a reservar).

## Casos alternativos / excepciones

- **Reserva de la dirección `?reserva=` que no es del socio o no existe** (404): el panel muestra "No encontramos esta reserva" sin datos ajenos (US-033, criterio 4).
- **Nombre de los socios participantes**: requeriría que `GET /reservations/{id}` devuelva el nombre de cada socio participante (cambio de contrato y de backend). **Fuera de EP-08**; si el Product Owner lo pide, se registra como historia de backend aparte.
- **Reserva que empieza mientras el panel está abierto**: al intentar cancelar, el servidor responde `CANCELLATION_TOO_LATE` y se muestra el mensaje.

## Sugerencia de pruebas funcionales

- Reserva a 3 días → abrir panel, cancelar, confirmar → pasa a cancelada sin recargar y aviso efímero.
- Reserva a 2 horas → "Cancelar reserva" deshabilitado con el motivo.
- Abrir `/socio/reservas/mias?reserva=<id>` → panel abierto; "atrás" lo cierra.
- Las pruebas existentes de `MyReservationsPage.test.tsx` se adaptan sin perder casos.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-033 (EP-04).
- Reglas: RN-RES-06, RN-RES-10.
- Casos de prueba: UX-09, UX-03, R-25 (por interfaz), T-03.
- Depende de: US-062, US-063, US-064, US-065, US-066.
- Habilita: —
