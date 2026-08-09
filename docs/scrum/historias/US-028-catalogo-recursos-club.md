# US-028 — Consultar el catálogo de instalaciones del club

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-028                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend + DevOps                                   |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Crítica                                            |
| Estimación relativa | 3                                                  |
| Dependencias        | US-027                                             |

## Historia

Como **socio**, quiero **ver las instalaciones del club con su aforo, duración de reserva y horario de atención**, para **saber qué puedo reservar y bajo qué condiciones antes de elegir un horario**.

> El catálogo es la base de todo EP-04: sin recursos cargados no hay disponibilidad que calcular ni reserva que crear. Esta historia entrega tanto la **carga inicial** del catálogo mock como su **consulta**.

## Contrato de API

`GET /resources` (member, admin), según `docs/api/contratos-api.md` §6. El contrato define la ruta y la autorización; la forma de la respuesta sigue las convenciones generales (§1) y el tipo `Resource` ya versionado en `packages/shared-types` (`resourceId`, `type`, `name`, `capacity`, `blockMinutes`, `opensAt`, `closesAt`, `requiresApproval`, `resourceStatus`).

## Reglas de negocio

RN-RES (tabla de recursos mock y horarios mock), RN-RES-02 (parrillas y salón social requieren aprobación), RN-RES-09 (aforo), RN-RES-11 (estado de mantenimiento), RN-ADM-04 (el administrador gestiona recursos, aforo y horarios). Modelo de datos: [§3.7 `Resource`](../../data/modelo-dynamodb.md).

## Catálogo mock a cargar (RN-RES)

| `resourceId`   | `type`         | `capacity` | `blockMinutes` | `opensAt` | `closesAt` | `requiresApproval` |
| -------------- | -------------- | ---------- | -------------- | --------- | ---------- | ------------------ |
| `futbol-1`     | `FUTBOL`       | 14         | 90             | 06:00     | 22:00      | false              |
| `futbol-2`     | `FUTBOL`       | 14         | 90             | 06:00     | 22:00      | false              |
| `tenis-1`      | `TENIS`        | 4          | 60             | 06:00     | 22:00      | false              |
| `tenis-2`      | `TENIS`        | 4          | 60             | 06:00     | 22:00      | false              |
| `padel-1`      | `PADEL`        | 4          | 90             | 06:00     | 22:00      | false              |
| `padel-2`      | `PADEL`        | 4          | 90             | 06:00     | 22:00      | false              |
| `piscina-1`    | `PISCINA`      | 5          | 120            | 08:00     | 20:00      | false              |
| `parrilla-1`   | `PARRILLA`     | 12         | 300            | 10:00     | 22:00      | true               |
| `parrilla-2`   | `PARRILLA`     | 12         | 300            | 10:00     | 22:00      | true               |
| `salon-social` | `SALON_SOCIAL` | 30         | 240            | 10:00     | 22:00      | true               |

Los horarios son **hora local del club** (`America/Lima`). El aforo de la piscina (5) corresponde a "titular + hasta 4 invitados" del Contexto Maestro. Todos los recursos se cargan con `resourceStatus=AVAILABLE`.

## Valor de negocio

Es el dato maestro sobre el que se apoyan la disponibilidad, el cálculo de aforo, la duración del bloque, el horario permitido y la exigencia de aprobación. Tenerlo como dato (y no como constante escondida en el código) es lo que permite después que el administrador edite aforo y horario sin desplegar (RN-ADM-04, US-036).

## Precondiciones

- Los endpoints de EP-04 están desplegados (US-027).
- El socio o administrador tiene sesión iniciada.

## Postcondiciones

- Existen los diez ítems `Resource` del catálogo mock en DynamoDB, con los valores de la tabla anterior.
- Cualquier socio autenticado puede consultarlos.

## Criterios de aceptación

1. Existe un mecanismo **versionado y repetible** de carga inicial del catálogo que crea los diez recursos de la tabla anterior con su `type`, `name`, `capacity`, `blockMinutes`, `opensAt`, `closesAt`, `requiresApproval` y `resourceStatus=AVAILABLE`.
2. La carga inicial es **idempotente**: ejecutarla dos veces no duplica recursos ni pisa cambios que el administrador haya hecho después sobre aforo, horario o estado (US-036).
3. `GET /resources` con token de rol `member` devuelve el catálogo completo con todos los campos del tipo `Resource`.
4. `GET /resources` con token de rol `admin` devuelve la misma información (el contrato lo autoriza para ambos roles).
5. `requiresApproval` es `true` únicamente para los recursos de tipo `PARRILLA` y `SALON_SOCIAL` (RN-RES-02); para el resto es `false` (RN-RES-01).
6. Los valores de `capacity` y `blockMinutes` de cada tipo coinciden exactamente con la tabla de recursos mock de `docs/product/reglas-de-negocio.md` §Módulo 4.
7. Los horarios devueltos respetan los horarios mock: club 06:00–22:00; piscina 08:00–20:00; parrillas y salón social 10:00–22:00.
8. Un recurso con `resourceStatus=MAINTENANCE` aparece en el catálogo marcado como tal, no desaparece de la lista.
9. Una llamada sin token devuelve 401 `UNAUTHENTICATED`.
10. El catálogo se lee de DynamoDB, no de constantes duplicadas en el frontend; el frontend consume el aforo, la duración y el horario que entrega la API.

## Casos alternativos / excepciones

- **Catálogo vacío** (carga inicial no ejecutada en un ambiente nuevo): `GET /resources` devuelve una lista vacía sin error, y la interfaz muestra su estado vacío. Se documenta la carga inicial como paso obligatorio del despliegue de un ambiente.
- **Recurso editado por el administrador**: el catálogo devuelve los valores vigentes en la base, no los del seed original.
- **Recurso agregado a futuro**: el modelo usa un slug legible fijo por recurso; agregar un recurso nuevo es una carga de datos, no un cambio de contrato.

## Sugerencia de pruebas funcionales

- R-27: `GET /resources` devuelve los diez recursos mock con aforo, duración de bloque, horario y `requiresApproval` coherentes con RN-RES.
- Ejecutar dos veces la carga inicial → sigue habiendo diez recursos (idempotencia).
- Llamada sin token → 401.
- Editar el aforo de un recurso (US-036) y volver a consultar → el catálogo refleja el valor nuevo.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES (recursos y horarios mock), RN-RES-01/02/09/11, RN-ADM-04.
- Casos de prueba: R-27, insumo de R-01, R-04, R-10, R-11, R-23.
- Depende de: US-027.
- Habilita: US-029, US-030, US-035, US-036.

## Nota para el Sprint Planning (decisión pendiente 2 de EP-04)

El contrato de API **no define un endpoint de creación de recursos** (solo `PATCH /resources/{resourceId}`) y la migración on-premise solo trae socios (RN-MIG-03), así que el mecanismo de carga inicial debe decidirse antes de implementar: script de carga versionado ejecutado en el despliegue del ambiente, o ítems gestionados como datos de infraestructura. La decisión es técnica (Arquitecto/DevOps); lo que esta historia exige funcionalmente es que el catálogo **exista, sea idempotente y no se pierda al redesplegar**. No se debe agregar un endpoint público de creación de recursos: no está en el contrato ni en la matriz de alcance.
