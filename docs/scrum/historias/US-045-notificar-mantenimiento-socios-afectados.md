# US-045 — Avisar a los socios afectados por un mantenimiento

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-045                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Media                                      |
| Estimación relativa | 3                                          |
| Dependencias        | US-040                                     |

## Historia

Como **socio con una reserva en una instalación que entra en mantenimiento**, quiero **recibir un aviso con la instalación y la franja afectada**, para **no ir al club en vano y poder reorganizarme a tiempo**.

## Contrato de API

Sin endpoints nuevos. Efecto lateral de `POST /resources/{resourceId}/maintenance` y de `PATCH /resources/{resourceId}` cuando cambia `resourceStatus` a `MAINTENANCE` (§6). Evento `RESOURCE_MAINTENANCE`.

## Reglas de negocio

RN-RES-11 (bloqueo por mantenimiento), RN-NOT-04 (recurso en mantenimiento). Decisión ya cerrada en EP-04: el mantenimiento **no cancela** las reservas existentes; informa cuántas quedan afectadas (`affectedReservationCount`) para que el administrador decida.

## Valor de negocio

Como el bloqueo no cancela las reservas existentes, el socio afectado necesita enterarse por otro lado. Hoy el administrador ve el número de reservas afectadas pero los socios no reciben nada. Cierra el caso R-21, el único de reservas que quedó abierto en EP-04.

## Precondiciones

- US-040 disponible. Mantenimiento operativo (US-035, US-036).

## Postcondiciones

- Cada titular de una reserva activa que se superpone con el mantenimiento recibe un aviso.

## Criterios de aceptación

1. Crear un bloqueo de mantenimiento emite `RESOURCE_MAINTENANCE` al titular de cada reserva activa (`CONFIRMED`, `PENDING_APPROVAL` o `APPROVED`) del mismo recurso que se superpone con la ventana del bloqueo. El número de avisos coincide con `affectedReservationCount`.
2. Poner un recurso en `resourceStatus=MAINTENANCE` (bloqueo indefinido) emite el aviso al titular de cada reserva activa **futura** de ese recurso.
3. El texto indica la instalación, la franja de la reserva afectada en hora de Lima y que la reserva **no** fue cancelada automáticamente; no promete una acción del club que el sistema no ejecuta (ver pregunta abierta 7 de EP-05).
4. Se emite un aviso por reserva afectada, no por socio: un socio con dos reservas afectadas recibe dos avisos, cada uno con su franja.
5. Un bloqueo que no afecta ninguna reserva no emite avisos.
6. Las reservas `CANCELLED` o `REJECTED` y las ya pasadas no generan aviso.
7. Liberar el bloqueo (`DELETE .../maintenance/{blockId}`) o devolver el recurso a `AVAILABLE` no emite aviso (no hay evento para eso en el catálogo).
8. Un fallo de correo o de bandeja no cambia la respuesta de la operación administrativa ni el `affectedReservationCount` devuelto.

## Casos alternativos / excepciones

- **Muchas reservas afectadas** (bloqueo largo sobre un recurso muy usado): todas deben recibir su aviso; si el volumen pone en riesgo el tiempo de respuesta de la Lambda, el Arquitecto puede decidir emitir los avisos de forma asíncrona, siempre que el administrador no reciba un error por ello.
- **Bloqueo creado y liberado enseguida**: los avisos ya enviados no se retiran.

## Sugerencia de pruebas funcionales

- R-21: bloqueo sobre una franja con dos reservas activas → dos avisos a sus titulares; `affectedReservationCount=2`.
- Bloqueo sin reservas → sin avisos.
- Recurso a `MAINTENANCE` con reservas futuras y pasadas → avisos solo para las futuras.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-RES-11, RN-NOT-04.
- Casos de prueba: R-21.
- Depende de: US-040.
- Habilita: cierre de R-21 (pendiente desde EP-04).
