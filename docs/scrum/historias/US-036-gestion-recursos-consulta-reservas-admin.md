# US-036 — Gestionar recursos y consultar todas las reservas como administrador

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-036                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + Frontend                                 |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Media                                              |
| Estimación relativa | 5                                                  |
| Dependencias        | US-028, US-030                                     |

## Historia

Como **administrador**, quiero **ajustar el aforo, el horario y el estado de cada instalación y consultar todas las reservas del club con filtros**, para **adaptar la operación a la realidad del club y resolver situaciones puntuales de los socios**.

## Contrato de API

`PATCH /resources/{resourceId}` (admin) según `docs/api/contratos-api.md` §6; `GET /reservations?scope=all&status=&resourceId=&from=&to=` y `POST /reservations/{reservationId}/cancel` con rol `admin` según §7. Esquemas ya versionados: `updateResourceSchema` y `listReservationsQuerySchema` en `packages/validation`.

## Reglas de negocio

RN-ADM-04 (el administrador gestiona recursos, aforo, horarios y mantenimiento), RN-ADM-07 (consulta pagos y reservas), RN-RES-10 (el administrador puede cancelar sin la restricción de 24 horas), RN-RES-11 (estado de mantenimiento del recurso). Auditoría `RESOURCE_UPDATED` (ADR-0008).

## Valor de negocio

El club cambia: una cancha reduce su aforo por obras, la piscina extiende su horario en verano, un socio pide ayuda con una reserva que ya no puede cancelar por sí mismo. Sin esta historia, cada uno de esos cambios exigiría un despliegue o una intervención manual en la base de datos. También es la vista que el administrador necesita para responder preguntas operativas antes de que existan los dashboards (EP-07).

## Precondiciones

- El catálogo de recursos existe (US-028) y hay reservas creadas (US-030).
- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Los cambios de aforo, horario o estado quedan persistidos en el recurso, auditados, y se reflejan de inmediato en la disponibilidad y en la validación de nuevas reservas.
- Una cancelación administrativa deja la reserva `CANCELLED`, libera la franja y devuelve el cupo mensual de los invitados externos.

## Criterios de aceptación

1. `PATCH /resources/{resourceId}` permite actualizar `capacity`, `opensAt`, `closesAt` y `resourceStatus`, individualmente o en conjunto, y responde 200 con el recurso actualizado.
2. Un cuerpo vacío o con valores inválidos (aforo no positivo, hora con formato incorrecto, `closesAt` anterior o igual a `opensAt`) devuelve 400 `VALIDATION_ERROR`.
3. Un `resourceId` inexistente devuelve 404 `NOT_FOUND`.
4. Tras cambiar el horario de un recurso, `GET /resources/{id}/availability` genera las franjas con el horario nuevo (RN-ADM-04).
5. Tras reducir el aforo, una reserva nueva que supere el aforo nuevo se rechaza con 422 `CAPACITY_EXCEEDED`; las reservas ya creadas **no** se invalidan retroactivamente, y ese comportamiento queda documentado en la interfaz.
6. Poner `resourceStatus=MAINTENANCE` deja el recurso no reservable por tiempo indefinido: su disponibilidad devuelve `resourceStatus=MAINTENANCE` y todas las franjas con `available=false` y `status=MAINTENANCE`, y toda reserva nueva se rechaza con `RESOURCE_IN_MAINTENANCE`; volver a `AVAILABLE` lo rehabilita (RN-RES-11).
7. `blockMinutes`, `type`, `name` y `requiresApproval` **no** son editables por este endpoint: son parte de la definición del recurso según RN-RES, su fuente de verdad es Terraform ([ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md)) y modificarlos alteraría reglas de negocio acordadas. Los cuatro campos que sí edita el administrador (`capacity`, `opensAt`, `closesAt`, `resourceStatus`) son los que Terraform solo inicializa y nunca revierte: un `apply` posterior no pisa el cambio.
8. `GET /reservations?scope=all` devuelve las reservas de todos los socios, paginadas, con filtros combinables por `status`, `resourceId` y rango `from`/`to`, e incluye el socio titular de cada reserva.
9. Un usuario con rol `member` que llama a `PATCH /resources/{resourceId}` o a `GET /reservations?scope=all` recibe 403 `FORBIDDEN`; si un `member` envía `scope=all`, se le responde 403 o se le restringe a sus propias reservas, nunca se le devuelven reservas ajenas.
10. Un administrador puede cancelar cualquier reserva **sin** la restricción de 24 horas (RN-RES-10), y esa cancelación libera la franja y devuelve el cupo mensual de los invitados externos igual que la cancelación del socio (US-033).
11. Toda actualización de recurso queda registrada en `AuditLog` con actor, acción `RESOURCE_UPDATED`, recurso objetivo, campos modificados y marca de tiempo.
12. En la interfaz administrativa, el administrador puede ver el catálogo de instalaciones, editar aforo/horario/estado con confirmación explícita, y consultar la lista de reservas con sus filtros, estados de carga, error y vacío.

## Casos alternativos / excepciones

- **Reducción de aforo por debajo de reservas existentes**: las reservas vigentes se respetan; solo las nuevas quedan limitadas. La interfaz advierte al administrador cuántas reservas futuras exceden el aforo nuevo.
- **Cambio de horario que deja reservas existentes fuera del nuevo rango**: las reservas vigentes se respetan; el administrador puede cancelarlas si corresponde.
- **Cancelación administrativa de una reserva `PENDING_APPROVAL`**: es válida y equivale a cerrarla sin decisión; para dejar constancia del motivo, lo correcto es rechazarla con motivo (US-034).
- **Filtro `from`/`to` invertido o muy amplio**: se valida el rango y se pagina; nunca se devuelve la tabla completa sin paginación.
- **Alta o baja de una instalación**: no se hace desde esta pantalla ni desde ningún endpoint. Agregar o quitar un recurso es un PR de infraestructura (ADR-0010, US-028); la consola administrativa solo ajusta aforo, horario y estado.

## Sugerencia de pruebas funcionales

- R-23: cambiar aforo/horario/estado de un recurso y verificar el efecto en la disponibilidad y en la creación de reservas.
- R-17: el administrador cancela una reserva a menos de 24 horas del inicio → permitido.
- AD-04: el administrador consulta reservas filtradas por recurso, estado y fechas.
- AD-05 (parcial): la acción `RESOURCE_UPDATED` queda en `AuditLog`.
- AD-06 / T-06: un `member` no accede a la gestión de recursos ni a `scope=all`, aunque conozca la URL.
- Validación: `closesAt` anterior a `opensAt` → 400; intento de modificar `blockMinutes` → ignorado o 400.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-ADM-04, RN-ADM-07, RN-RES-10, RN-RES-11, ADR-0008.
- Casos de prueba: R-17, R-23; AD-04, AD-05 (parcial), AD-06, T-06.
- Depende de: US-028, US-030 (y de US-031 para la devolución del cupo de invitados).
- Habilita: EP-07 (métricas de reservas por instalación y ocupación, RN-ANL-03/07).
