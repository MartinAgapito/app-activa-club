# US-072 — Reservar una instalación con un asistente por pasos en ventana

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-072                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Crítica                                                  |
| Estimación relativa | 5                                                        |
| Dependencias        | US-062, US-066, US-067                                   |

## Contexto

El flujo de reserva de US-032 está completo y probado, pero vive en una sola página (`ReservationsPage.tsx`, 545 líneas) donde catálogo, disponibilidad, participantes y resumen se apilan en una columna. El socio tiene que desplazarse para entender en qué parte está y qué falta. Esta historia **reorganiza** ese mismo flujo en un asistente de cuatro pasos dentro de una ventana, reutilizando las piezas existentes (`ParticipantsSection`, `ReservationSummary`, `reservation-errors`, `eligibility`) y **conservando todos los criterios de US-032**.

## Historia

Como **socio**, quiero **reservar una instalación en una ventana que me guíe paso a paso —instalación, día y franja, participantes y confirmación—**, para **completar la reserva sin perderme ni desplazarme por una página larga**.

## Contrato de API

Los mismos de US-032, sin cambios: `GET /resources`, `GET /resources/{id}/availability?date=`, `GET /members/lookup?dni=`, `GET /guests/lookup?dni=`, `POST /reservations` (§6 y §7).

## Reglas de negocio

Las de US-032 (RN-RES-01..05, RN-RES-07..09, RN-RES-11, RN-RES-12, RN-PAG-06). Todas las valida el servidor; la interfaz solo las anticipa.

## Valor de negocio

Es el flujo central del producto y el que el dueño del producto calificó de "poco intuitivo". Un asistente con pasos visibles es lo que el jurado espera ver en la demostración.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Las de US-032: una reserva `CONFIRMED` o `PENDING_APPROVAL` creada por el servidor.

## Criterios de aceptación

1. El botón "Nueva reserva" abre el asistente en una ventana (US-062) con un indicador de pasos (US-067): **1. Instalación**, **2. Día y franja**, **3. Participantes**, **4. Confirmación**.
2. **Paso 1**: el socio elige una instalación entre las del catálogo, con tipo, aforo, duración del bloque, estado y si requiere aprobación. Si el asistente se abre con una instalación preseleccionada, empieza en el paso 2.
3. **Paso 2**: el socio elige fecha y una franja disponible; las franjas ocupadas, en mantenimiento o pasadas se ven deshabilitadas con su motivo (US-032, criterios 2 y 3).
4. **Paso 3**: el socio agrega o quita participantes por DNI con los límites de aforo e invitados de US-032 (criterios 4 y 5). El paso se puede saltar ("Reservar solo para mí").
5. **Paso 4**: muestra el resumen (instalación, fecha y franja en hora de Lima, participantes, notas, aviso de aprobación administrativa si aplica) y el botón "Confirmar reserva".
6. "Siguiente" se habilita solo cuando el paso actual está completo; "Atrás" vuelve al paso anterior **conservando** lo ya elegido (instalación, fecha, franja, participantes, notas).
7. Cambiar la instalación en el paso 1 descarta la franja elegida, pero conserva los participantes, avisando si alguno excede el aforo nuevo.
8. Todo el flujo se completa **sin salir de la ventana ni cambiar de dirección**; el contenido de cada paso cabe en la ventana y, si no, se desplaza dentro de ella.
9. Al confirmar con éxito, la ventana se cierra, aparece un aviso efímero (US-066) — "Reserva confirmada" o "Solicitud enviada a revisión" — con la acción "Ver en Mis reservas", y las consultas de reservas y disponibilidad se refrescan.
10. Ante un error del servidor, el asistente permanece abierto y muestra el mensaje traducido en el paso que corresponde: `RESERVATION_OVERLAP` y `RESOURCE_IN_MAINTENANCE` vuelven al paso 2 con la disponibilidad refrescada; `CAPACITY_EXCEEDED`, `PARTICIPANT_OVERLAP` y `GUEST_MONTHLY_LIMIT` vuelven al paso 3; los demás se muestran en el paso 4 (US-032, criterios 8, 9 y 14).
11. El botón "Confirmar reserva" se deshabilita mientras la petición está en curso y la ventana no se puede cerrar en ese momento (US-032, criterio 11).
12. Si el socio no puede reservar (deuda o membresía no vigente), "Nueva reserva" no abre el asistente: se muestra el motivo y el acceso al pago (US-032, criterio 10).
13. Cerrar el asistente (Escape, botón Cerrar) con algo ya elegido pide confirmación ("¿Descartar esta reserva?"); sin nada elegido, se cierra directamente.
14. Es usable en 375 px (ventana a pantalla completa con los botones Atrás/Siguiente siempre visibles) y solo con teclado.

## Casos alternativos / excepciones

- **Catálogo o disponibilidad que no cargan**: el paso muestra `ErrorState` con reintentar dentro de la ventana.
- **Sesión expirada al confirmar**: mismo comportamiento que hoy (cerrar sesión y volver al login).
- **Recarga del navegador a mitad del asistente**: el borrador se pierde (no se persiste en el MVP); solo se conserva la instalación preseleccionada si venía en la URL (US-073).

## Sugerencia de pruebas funcionales

- Recorrido completo con teclado: cancha de fútbol, mañana, primera franja libre, un socio participante, confirmar → aviso "Reserva confirmada" y la reserva aparece en Mis reservas.
- Parrilla → paso 4 informa la aprobación; resultado "Solicitud enviada a revisión".
- Simular `RESERVATION_OVERLAP` al confirmar → vuelve al paso 2 con la disponibilidad refrescada y los participantes intactos.
- Volver del paso 4 al 1 y avanzar de nuevo → todo lo elegido se conserva salvo la franja si cambió la instalación.
- Las pruebas existentes de `ReservationsPage.test.tsx` se adaptan sin perder ningún caso cubierto.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-032 (EP-04) sin cambiar sus reglas.
- Reglas: las de US-032.
- Casos de prueba: UX-07, UX-08, R-01..R-19 (por interfaz), T-01, T-02.
- Depende de: US-062, US-066, US-067.
- Habilita: US-073; el acceso "Nueva reserva" de US-070.
