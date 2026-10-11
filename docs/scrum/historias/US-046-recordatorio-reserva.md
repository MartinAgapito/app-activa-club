# US-046 — Recordar una reserva próxima

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-046                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + DevOps                           |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Media                                      |
| Estimación relativa | 5                                          |
| Dependencias        | US-040                                     |

## Historia

Como **socio titular de una reserva**, quiero **recibir un recordatorio el día anterior**, para **no olvidar mi reserva y avisar a tiempo a mis acompañantes**.

## Contrato de API

Sin endpoints nuevos. Proceso programado interno que emite `RESERVATION_REMINDER` (catálogo `NotificationEvent`). Consulta de reservas por recurso y rango de tiempo: patrón de acceso 21 (GSI3) del modelo de datos.

## Reglas de negocio

RN-NOT-04 (recordatorio de reserva), RN-RES-06 (el titular es el responsable de la reserva y de sus participantes).

## Valor de negocio

El recordatorio reduce las reservas olvidadas: una cancha vacía con una reserva confirmada es un espacio que otro socio no pudo usar.

## Precondiciones

- US-040 disponible. Existen reservas activas (EP-04).

## Postcondiciones

- Cada reserva `CONFIRMED` o `APPROVED` del día siguiente tiene, como máximo, un recordatorio enviado a su titular.

## Criterios de aceptación

1. Un proceso programado se ejecuta una vez al día a una hora fija de `America/Lima` (propuesta: 18:00) y envía `RESERVATION_REMINDER` al titular de cada reserva `CONFIRMED` o `APPROVED` cuyo inicio cae el **día calendario siguiente** en hora de Lima (ver pregunta abierta 8 de EP-05).
2. El texto incluye la instalación, la fecha y la hora de inicio y fin, y la cantidad de participantes; no incluye nombres ni DNI de los participantes.
3. Las reservas `PENDING_APPROVAL`, `CANCELLED` y `REJECTED` no reciben recordatorio.
4. Una reserva recibe como máximo **un** recordatorio, aunque el proceso se reintente o se ejecute dos veces el mismo día.
5. Una reserva cancelada después de enviado el recordatorio no genera un segundo aviso por el recordatorio (sí recibe el de cancelación, US-044).
6. El proceso recorre todos los recursos del catálogo; un error en un recurso o en una reserva no detiene el resto y queda registrado.
7. Cada ejecución deja un log estructurado con reservas evaluadas, recordatorios enviados y errores; una ejecución fallida dispara una alarma (ADR-0008).
8. La programación del proceso vive en Terraform, se despliega por GitHub Actions con OIDC y no deja recursos siempre encendidos.

## Casos alternativos / excepciones

- **Reserva creada después de que corrió el proceso del día** para el día siguiente: no recibe recordatorio. Es aceptable en el MVP, porque el socio acaba de reservar.
- **Reserva en una franja ahora bloqueada por mantenimiento**: recibe el recordatorio igual (la reserva sigue vigente) y ya recibió el aviso de mantenimiento (US-045).
- **Recordatorios a los participantes**: fuera de esta historia (ver pregunta abierta 4 de EP-05).

## Sugerencia de pruebas funcionales

- Reserva confirmada para mañana → un recordatorio al titular.
- Reserva para pasado mañana → sin recordatorio hoy.
- Reserva `PENDING_APPROVAL` para mañana → sin recordatorio.
- Doble ejecución → un solo recordatorio por reserva.
- Borde de zona horaria: reserva a las 06:00 de Lima del día siguiente (11:00 UTC) se incluye; reserva a las 23:00 de Lima de hoy no.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-04, RN-RES-06.
- Casos de prueba: N-11 (evento de recordatorio).
- Depende de: US-040.
- Habilita: cierre del recordatorio de reserva pendiente desde EP-04.
