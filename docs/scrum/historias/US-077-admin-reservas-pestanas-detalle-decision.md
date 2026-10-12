# US-077 — Revisar y decidir reservas desde pestañas, panel de detalle y ventanas

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-077                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-062, US-063, US-064, US-065, US-066                   |

## Contexto

`/admin/reservas` (`ReservationsAdminPage`) apila la bandeja de pendientes (`PendingReservationsInbox`, US-034) y el listado general con filtros (`AllReservationsSection`, US-036), ambos con tarjetas (`AdminReservationCard`). Aprobar, rechazar y cancelar ya piden confirmación con `ConfirmDialog`, pero el detalle con participantes no se ve.

## Historia

Como **administrador**, quiero **separar las reservas por aprobar del resto, abrir el detalle de cualquiera en un panel y aprobar, rechazar con motivo o cancelar desde ahí**, para **decidir con toda la información y sin desplazarme entre dos listas**.

## Contrato de API

`GET /reservations?scope=all&status=&resourceId=&from=&to=`, `GET /reservations/{reservationId}`, `POST /reservations/{reservationId}/approve`, `.../reject` (con `reason`) y `.../cancel` (§7). Sin cambios en el servidor. `scope=all` exige `status` o `resourceId`: la interfaz siempre envía al menos uno.

## Reglas de negocio

RN-RES-02 (aprobación de parrillas y salón social), RN-RES-10 (el administrador cancela sin la restricción de 24 horas), RN-ADM-05, RN-ADM-07.

## Valor de negocio

La aprobación de parrillas y salón social es la tarea administrativa más frecuente del MVP y la más visible en la demostración.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Según la acción: reserva `APPROVED`, `REJECTED` (con motivo) o `CANCELLED` (US-034, US-036).

## Criterios de aceptación

1. La pantalla tiene dos pestañas (US-064): **Por aprobar** (con contador) y **Todas**; la pestaña activa y los filtros se guardan en la URL.
2. **Por aprobar** lista las reservas `PENDING_APPROVAL` en la tabla de US-065, de la más próxima a la más lejana, con instalación, fecha y franja en hora de Lima, titular y participantes.
3. **Todas** tiene filtros de estado, instalación y rango de fechas sobre la tabla; sin estado ni instalación elegidos, pide elegir uno antes de consultar (exigencia del contrato), como hoy.
4. Al activar una fila se abre un panel lateral (US-063) con el detalle (`GET /reservations/{id}`): instalación, fecha y franja, estado, titular, participantes (invitados con nombre; socios como "Socio del club"), motivo de rechazo y momento de cancelación cuando existan. El panel tiene dirección propia (`?reserva=<id>`).
5. En el pie del panel están las acciones que correspondan al estado: "Aprobar" y "Rechazar" para `PENDING_APPROVAL`; "Cancelar" para reservas activas.
6. "Rechazar" abre una ventana (US-062) con el campo de motivo obligatorio; el botón de confirmar está deshabilitado mientras el motivo esté vacío.
7. "Aprobar" y "Cancelar" piden confirmación en ventana con el resumen de la reserva.
8. Tras una decisión exitosa, la ventana y el panel se cierran, la reserva sale de "Por aprobar" (o cambia de estado en "Todas") **sin recargar la página**, el contador se actualiza y aparece un aviso efímero ("Reserva aprobada", "Reserva rechazada", "Reserva cancelada").
9. `RESERVATION_NOT_PENDING` (otro administrador ya decidió) y `CONFLICT` se muestran traducidos dentro de la ventana, y la lista se refresca al cerrarla.
10. La dirección `/admin/reservas?pestana=pendientes&reserva=<id>` abre la reserva directamente (usada por el inicio del administrador, US-071).

## Casos alternativos / excepciones

- **Nombre de los socios participantes**: igual que en US-074, requeriría backend; fuera de EP-08.

## Sugerencia de pruebas funcionales

- Parrilla pendiente → abrir panel → "Rechazar" sin motivo deshabilitado → con motivo, confirmar → desaparece de "Por aprobar" sin recargar y aviso efímero.
- Dos administradores: el segundo intenta aprobar la misma → mensaje "ya fue decidida" dentro de la ventana.
- "Todas" sin filtros → pide elegir estado o instalación.
- Las pruebas existentes de `ReservationsAdminPage.test.tsx` se adaptan sin perder casos.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-034 y US-036 (EP-04).
- Reglas: RN-RES-02, RN-RES-10, RN-ADM-05, RN-ADM-07.
- Casos de prueba: UX-10, UX-03, R-17, R-29 (por interfaz), T-06.
- Depende de: US-062, US-063, US-064, US-065, US-066.
- Habilita: accesos a reservas pendientes de US-071 y US-059.
