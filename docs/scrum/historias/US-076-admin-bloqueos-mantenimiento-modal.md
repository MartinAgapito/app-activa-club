# US-076 — Crear y liberar bloqueos de mantenimiento desde ventanas

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-076                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Media                                                    |
| Estimación relativa | 3                                                        |
| Dependencias        | US-062, US-064, US-065, US-066                           |

## Contexto

`MaintenanceSection` (US-035) tiene el formulario de creación de bloqueos fijo arriba y la lista de bloqueos debajo, en la misma página que la gestión de instalaciones. Liberar un bloqueo ya usa `ConfirmDialog`.

## Historia

Como **administrador**, quiero **ver los bloqueos de mantenimiento en una lista y crear o liberar uno desde una ventana**, para **programar un mantenimiento sin un formulario siempre a la vista y saber al instante a cuántas reservas afecta**.

## Contrato de API

`GET /resources/{resourceId}/maintenance`, `POST /resources/{resourceId}/maintenance` y `DELETE /resources/{resourceId}/maintenance/{blockId}` (§6). Sin cambios en el servidor. La lista de bloqueos es **por instalación** (no hay listado global).

## Reglas de negocio

RN-RES-11 (bloqueo temporal por mantenimiento), RN-ADM-04.

## Valor de negocio

Completa la reorganización de `/admin/recursos` y hace visible el dato más importante de un bloqueo: cuántas reservas quedan afectadas.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Si crea: el bloqueo queda registrado e impide reservas nuevas en la franja (US-035).
- Si libera: el bloqueo deja de existir y las franjas vuelven a estar disponibles.

## Criterios de aceptación

1. La pestaña **Mantenimiento** de `/admin/recursos` tiene un selector de instalación (con la instalación elegida en la URL) y lista sus bloqueos vigentes y futuros en la tabla de US-065: inicio, fin (hora de Lima), motivo y acción "Liberar".
2. El botón "Nuevo bloqueo" abre una ventana (US-062) con instalación (precargada con la seleccionada), fecha y hora de inicio, fecha y hora de fin y motivo.
3. El formulario valida antes de enviar que el fin sea posterior al inicio y que el inicio no esté en el pasado, con el mensaje junto al campo.
4. Al crear con éxito, la ventana se cierra, el bloqueo aparece en la lista sin recargar y un aviso efímero (US-066) informa "Bloqueo creado"; si `affectedReservationCount` es mayor que cero, el aviso es persistente, indica "N reservas quedan dentro del bloqueo" y ofrece "Ver reservas", que abre `/admin/reservas` filtrado por esa instalación (US-077).
5. Un error del servidor se muestra traducido dentro de la ventana, sin cerrarla ni perder lo escrito.
6. "Liberar" abre una confirmación en ventana con instalación, inicio, fin y motivo; al confirmar, el bloqueo desaparece de la lista sin recargar y aparece el aviso "Bloqueo liberado". Un `NOT_FOUND` (ya liberado por otro administrador) se informa y la lista se refresca.
7. Sin bloqueos para la instalación elegida, se muestra "Sin bloqueos vigentes" con el botón "Nuevo bloqueo".
8. El acceso rápido "Bloquear una instalación por mantenimiento" del inicio del administrador (US-071) abre esta pestaña con la ventana de nuevo bloqueo abierta.

## Casos alternativos / excepciones

- **Vista de todos los bloqueos de todas las instalaciones a la vez**: requeriría diez consultas (una por instalación) o un endpoint nuevo; fuera de esta historia salvo decisión en la Planning.
- **Bloqueos ya vencidos**: no se listan por defecto (comportamiento del contrato sin `from`/`to`).

## Sugerencia de pruebas funcionales

- Crear un bloqueo en la cancha con una reserva confirmada dentro → aviso persistente "1 reserva queda dentro del bloqueo" y "Ver reservas" abre la lista filtrada.
- Fin anterior al inicio → mensaje junto al campo.
- Liberar → desaparece sin recargar y aviso efímero.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-035 (EP-04).
- Reglas: RN-RES-11, RN-ADM-04.
- Casos de prueba: UX-11, R-20, R-22 (por interfaz), T-06.
- Depende de: US-062, US-064, US-065, US-066. Comparte con US-075 la estructura de pestañas de `/admin/recursos`: la historia que se integre primero la crea.
- Habilita: —
