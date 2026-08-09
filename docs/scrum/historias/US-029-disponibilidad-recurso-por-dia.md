# US-029 — Consultar la disponibilidad de una instalación por día

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-029                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + Frontend                                 |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Alta                                               |
| Estimación relativa | 5                                                  |
| Dependencias        | US-028                                             |

## Historia

Como **socio**, quiero **ver qué franjas horarias de una instalación están libres en un día concreto**, para **elegir un horario que sé que puedo reservar sin recibir un rechazo después**.

## Contrato de API

`GET /resources/{resourceId}/availability?date=YYYY-MM-DD` (member), según `docs/api/contratos-api.md` §6. Response 200 con `resourceId`, `date`, `blockMinutes`, `resourceStatus` y `slots[]` de `{ startsAt, endsAt, available, status }`. Tipos versionados: `AvailabilityResponse`, `AvailabilitySlot` y `AvailabilitySlotStatus` en `packages/shared-types`.

`status` explica **por qué** una franja no es reservable: `AVAILABLE`, `RESERVED` (tomada por otra reserva activa), `MAINTENANCE` (bloqueo de mantenimiento o recurso con `resourceStatus=MAINTENANCE`) o `PAST` (franja ya iniciada). `available` se mantiene como el campo de decisión del cliente y equivale a `status === 'AVAILABLE'`.

## Reglas de negocio

RN-RES-01 (confirmación automática si hay disponibilidad), RN-RES-07 (sin cruces por recurso), RN-RES-11 (bloqueo por mantenimiento), horarios mock por ámbito. Modelo de datos: consulta 20 del [modelo DynamoDB](../../data/modelo-dynamodb.md) (`GSI3PK=RESOURCE#<id>`, rango del día), que comparte índice con los bloqueos de mantenimiento.

## Valor de negocio

Es lo que convierte la reserva en una experiencia usable en vez de un formulario de prueba y error. También reduce el ruido de errores 409/422 en el backend: el socio solo intenta franjas que ya sabe libres. Y es el primer lugar donde el socio percibe el mantenimiento de un recurso.

## Precondiciones

- El catálogo de recursos existe y el recurso solicitado está cargado (US-028).
- El socio tiene sesión iniciada con rol `member`.

## Postcondiciones

- Ninguna: la consulta no modifica estado. La disponibilidad es una foto del momento, no una reserva del cupo.

## Reglas de cálculo de franjas (funcionales)

- Las franjas se generan desde `opensAt` hasta `closesAt` del recurso, en pasos de `blockMinutes`, en zona `America/Lima`, y se devuelven en UTC ISO-8601 (convención del modelo de datos §2).
- Una franja que no cabe completa antes de `closesAt` no se ofrece.
- Una franja está `available=false` si se cruza con una reserva **activa** del recurso (`CONFIRMED`, `PENDING_APPROVAL` o `APPROVED`) o con un bloqueo de mantenimiento. Las reservas `CANCELLED` y `REJECTED` no bloquean.
- Una reserva `PENDING_APPROVAL` **sí ocupa la franja** mientras espera decisión administrativa: de lo contrario dos socios podrían tener aprobada la misma parrilla a la misma hora (aclaración funcional de RN-RES-07, ver US-030).
- Si el recurso está en `resourceStatus=MAINTENANCE`, todas las franjas del día se devuelven con `available=false` y `status=MAINTENANCE`.
- Las franjas cuyo inicio ya pasó respecto del momento actual se devuelven con `available=false` y `status=PAST`.
- Cuando aplica más de un motivo, la precedencia de `status` es **`PAST` → `MAINTENANCE` → `RESERVED`**. En particular, una franja bloqueada por mantenimiento que además tiene una reserva previa (las existentes **no** se cancelan, US-035) se informa como `MAINTENANCE`.
- El motivo del bloqueo (`reason` del `MaintenanceBlock`) no se devuelve al socio: es una nota operativa del administrador.

## Criterios de aceptación

1. `GET /resources/{resourceId}/availability?date=YYYY-MM-DD` devuelve 200 con `resourceId`, `date`, `blockMinutes`, `resourceStatus` y la lista completa de franjas del día, cada una con `startsAt`, `endsAt`, `available` y `status`.
2. La primera franja empieza en el `opensAt` del recurso y la última termina como máximo en su `closesAt`, en hora local del club: piscina 08:00–20:00, parrillas y salón social 10:00–22:00, resto 06:00–22:00.
3. La duración de cada franja es exactamente el `blockMinutes` del recurso (fútbol 90, tenis 60, pádel 90, piscina 120, parrilla 300, salón 240).
4. Una franja ocupada por una reserva activa del mismo recurso se devuelve con `available=false` y `status=RESERVED` (RN-RES-07).
5. Una franja solapada por un bloqueo de mantenimiento se devuelve con `available=false` y `status=MAINTENANCE`, aunque no exista ninguna reserva, y se distingue así de una franja simplemente ocupada (RN-RES-11).
6. Una franja ocupada por una reserva `PENDING_APPROVAL` se devuelve con `available=false` y `status=RESERVED`; una franja de una reserva `CANCELLED` o `REJECTED` vuelve a `available=true` y `status=AVAILABLE`.
7. Un recurso con `resourceStatus=MAINTENANCE` devuelve `resourceStatus=MAINTENANCE` y **todas** sus franjas con `available=false` y `status=MAINTENANCE`.
8. Las franjas ya pasadas del día en curso se devuelven con `available=false` y `status=PAST`.
9. Un `date` con formato inválido devuelve 400 `VALIDATION_ERROR`; un `resourceId` inexistente devuelve 404 `NOT_FOUND`.
10. Una llamada sin token devuelve 401 `UNAUTHENTICATED`.
11. El frontend muestra las franjas del día seleccionado distinguiendo visualmente al menos tres situaciones —libre, ocupada por otra reserva y **en mantenimiento**—, permite cambiar de día y de recurso, y presenta los estados de carga, error y "sin franjas disponibles". Cuando `resourceStatus=MAINTENANCE`, además muestra un aviso a nivel de recurso (bloqueo indefinido) en vez de repetir el mismo mensaje franja por franja.
12. La interfaz nunca deja seleccionar una franja marcada como no disponible, pero el backend vuelve a validarlo al crear la reserva: la disponibilidad es informativa, no una reserva de cupo (US-030).

## Casos alternativos / excepciones

- **Carrera entre consulta y creación**: entre ver la franja libre y confirmar la reserva, otro socio puede tomarla. El backend responde `RESERVATION_OVERLAP` (US-030) y la interfaz refresca la disponibilidad e invita a elegir otra franja, sin perder los datos ya cargados.
- **Día completo sin franjas libres**: se devuelven todas las franjas con `available=false` y la interfaz muestra un estado vacío explicativo, no un error.
- **Consulta de una fecha pasada**: se responde 200 con todas las franjas no disponibles (no es un error de validación).
- **Recurso en mantenimiento parcial**: solo las franjas solapadas por el bloqueo quedan no disponibles (`status=MAINTENANCE`); el resto del día sigue reservable.
- **Franja bloqueada que ya tenía una reserva**: se informa como `MAINTENANCE`, no como `RESERVED`. La reserva previa sigue vigente (no se cancela sola, US-035); para el socio que consulta, lo relevante es que la franja no se puede tomar por mantenimiento.

## Sugerencia de pruebas funcionales

- R-01 (parcial): las franjas libres de fútbol/tenis/pádel/piscina se ofrecen correctamente.
- R-02: una franja ya ocupada no se ofrece como disponible.
- R-20 (parcial): tras crear un bloqueo de mantenimiento, la franja pasa a `available=false` con `status=MAINTENANCE` (no `RESERVED`).
- R-22: tras liberar el bloqueo, la franja vuelve a `available=true` con `status=AVAILABLE`.
- R-23 (parcial): tras cambiar el horario de un recurso, la lista de franjas cambia en consecuencia.
- Verificación de zona horaria: para el club, la primera franja del día corresponde a las 06:00 hora de Lima.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-01, RN-RES-07, RN-RES-11, horarios mock.
- Casos de prueba: R-01 (parcial), R-02, R-20 (parcial), R-22, R-23 (parcial).
- Depende de: US-028.
- Habilita: US-032 (flujo de reserva en la interfaz), US-035 (verificación del bloqueo).
