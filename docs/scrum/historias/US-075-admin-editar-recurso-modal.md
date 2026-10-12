# US-075 — Editar una instalación desde una ventana

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-075                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque C — flujos rehechos)         |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Media                                                    |
| Estimación relativa | 3                                                        |
| Dependencias        | US-062, US-064, US-065, US-066                           |

## Contexto

En `/admin/recursos`, `ResourceManagementSection` (US-036) muestra las diez instalaciones como tarjetas y abre el formulario de edición en línea, dentro de la misma lista; debajo, en la misma página, está la sección de mantenimiento (US-076). Editar obliga a desplazarse y mezcla la lista con el formulario.

## Historia

Como **administrador**, quiero **ver las instalaciones en una tabla y editar su aforo, horario o estado en una ventana**, para **cambiar una instalación sin perder de vista el resto ni desplazarme por la página**.

## Contrato de API

`GET /resources` y `PATCH /resources/{resourceId}` (§6). Sin cambios en el servidor. Solo `capacity`, `opensAt`, `closesAt` y `resourceStatus` son editables (ADR-0010).

## Reglas de negocio

RN-ADM-04 (gestión de recursos, aforo, horarios y mantenimiento).

## Valor de negocio

Uno de los CRUD que el dueño del producto calificó de "básicos"; con tabla y ventana se lee y se edita en segundos.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Si guarda: el recurso queda actualizado (US-036) con auditoría `RESOURCE_UPDATED`.

## Criterios de aceptación

1. `/admin/recursos` tiene dos pestañas (US-064), **Instalaciones** y **Mantenimiento** (US-076), con la pestaña activa en la URL.
2. La pestaña Instalaciones lista las diez instalaciones en la tabla de US-065 con nombre, tipo, aforo, horario, duración del bloque, si requiere aprobación y estado con etiqueta.
3. Cada fila tiene la acción "Editar", que abre una ventana (US-062) con el formulario de aforo, hora de apertura, hora de cierre y estado, precargado con los valores actuales.
4. Los campos no editables (nombre, tipo, duración del bloque, requiere aprobación) se muestran en la ventana como información de solo lectura, con la nota de que se cambian por despliegue (ADR-0010).
5. El formulario valida antes de enviar: aforo entero mayor que cero y cierre posterior a la apertura, con el mensaje junto al campo.
6. "Guardar" solo envía los campos modificados; sin cambios, el botón está deshabilitado.
7. Al guardar con éxito, la ventana se cierra, la fila se actualiza sin recargar la página y aparece el aviso efímero "Instalación actualizada" (US-066).
8. Un error del servidor (`VALIDATION_ERROR`, `NOT_FOUND`) se muestra traducido **dentro de la ventana, sin cerrarla** y sin perder lo escrito.
9. Cambiar el estado a "En mantenimiento" muestra en la ventana el aviso de que impide reservas nuevas en todo el recurso pero no cancela las existentes (contrato §6).

## Casos alternativos / excepciones

- **Alta o baja de instalaciones**: no existe endpoint ni existirá (ADR-0010); la pantalla no ofrece esas acciones.
- **Cerrar la ventana con cambios sin guardar**: pide confirmación.

## Sugerencia de pruebas funcionales

- Editar el aforo de la piscina → fila actualizada y aviso efímero, sin recargar.
- Cierre anterior a la apertura → mensaje junto al campo y "Guardar" no envía.
- Simular `VALIDATION_ERROR` del servidor → mensaje dentro de la ventana abierta.
- Las pruebas existentes de `ResourcesMaintenancePage.test.tsx` se adaptan sin perder casos.

## Trazabilidad

- Épica: EP-08 (bloque C). Reorganiza la interfaz de US-036 (EP-04).
- Reglas: RN-ADM-04.
- Casos de prueba: UX-11, R-23 (por interfaz), T-06.
- Depende de: US-062, US-064, US-065, US-066.
- Habilita: —
