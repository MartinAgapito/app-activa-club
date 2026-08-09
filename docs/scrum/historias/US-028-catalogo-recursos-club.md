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

## Catálogo a cargar (RN-RES) — definición exacta

Estos son los diez recursos, con los valores exactos que deben quedar cargados. `name` es el rótulo que ve el socio en la interfaz.

| `resourceId`   | `type`         | `name`              | `capacity` | `blockMinutes` | `opensAt` | `closesAt` | `requiresApproval` | `resourceStatus` |
| -------------- | -------------- | ------------------- | ---------- | -------------- | --------- | ---------- | ------------------ | ---------------- |
| `futbol-1`     | `FUTBOL`       | Cancha de fútbol 1  | 14         | 90             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `futbol-2`     | `FUTBOL`       | Cancha de fútbol 2  | 14         | 90             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `tenis-1`      | `TENIS`        | Cancha de tenis 1   | 4          | 60             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `tenis-2`      | `TENIS`        | Cancha de tenis 2   | 4          | 60             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `padel-1`      | `PADEL`        | Cancha de pádel 1   | 4          | 90             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `padel-2`      | `PADEL`        | Cancha de pádel 2   | 4          | 90             | 06:00     | 22:00      | false              | `AVAILABLE`      |
| `piscina-1`    | `PISCINA`      | Piscina             | 5          | 120            | 08:00     | 20:00      | false              | `AVAILABLE`      |
| `parrilla-1`   | `PARRILLA`     | Zona de parrillas 1 | 12         | 300            | 10:00     | 22:00      | true               | `AVAILABLE`      |
| `parrilla-2`   | `PARRILLA`     | Zona de parrillas 2 | 12         | 300            | 10:00     | 22:00      | true               | `AVAILABLE`      |
| `salon-social` | `SALON_SOCIAL` | Salón social        | 30         | 240            | 10:00     | 22:00      | true               | `AVAILABLE`      |

Origen de los valores: cantidad de instalaciones, duración de bloque, capacidad y tipo de confirmación salen de la tabla de recursos mock de `docs/product/reglas-de-negocio.md` §Módulo 4 y del Contexto Maestro; los horarios, de la tabla de horarios mock del mismo documento. El aforo de la piscina (5) corresponde a "titular + hasta 4 invitados". Los `name` son los únicos valores propuestos aquí (el negocio nunca los especificó) y son cosméticos: cambiarlos no afecta ninguna regla.

Los horarios son **hora local del club** (`America/Lima`). Todos los recursos se cargan con `resourceStatus=AVAILABLE`.

## Mecanismo de carga: ítems estáticos de Terraform (decisión cerrada)

El catálogo se gestiona como **datos de infraestructura**: un `aws_dynamodb_table_item` por recurso, definido una sola vez (módulo o `locals` compartido con `for_each`) e instanciado desde `environments/dev` y `environments/prd`, versionado y revisado en PR como el resto de la infraestructura. No hay endpoint de alta, ni Lambda de _seed_, ni script manual. Justificación y alternativas descartadas: [ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md).

### Quién manda sobre cada campo

| Campos                                                           | Fuente de verdad  | Cómo se cambian                          |
| ---------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| `resourceId`, `type`, `name`, `blockMinutes`, `requiresApproval` | Terraform         | PR + `apply` (con reemplazo del ítem)    |
| `capacity`, `opensAt`, `closesAt`, `resourceStatus`              | Runtime (`admin`) | `PATCH /resources/{resourceId}` (US-036) |

Cada ítem lleva `lifecycle { ignore_changes = [item] }`: Terraform lo **crea si falta** y **nunca lo sobrescribe**, así que un `apply` posterior no revierte el aforo, el horario ni el estado que haya editado el administrador. Si alguien borra el ítem de la tabla, el siguiente `plan` lo detecta ausente y lo recrea con sus valores originales.

Cambiar un campo de los que manda Terraform en un recurso ya desplegado exige forzar el reemplazo del ítem (`terraform apply -replace='...aws_dynamodb_table_item.resource["futbol-1"]'`), lo que **también restablece los campos de runtime de ese recurso**. Es deliberado: `blockMinutes` y `requiresApproval` son reglas de negocio (RN-RES-01/02), no ajustes operativos, y deben pasar por revisión.

## Nota para DevOps (bloqueante, antes de mergear)

El rol de despliegue de CI **hoy no puede escribir ítems** en la tabla de la aplicación: `infrastructure/terraform/bootstrap` solo le concede `GetItem`/`PutItem`/`DeleteItem` sobre la tabla de _locks_ de Terraform y operaciones de nivel tabla sobre `activa-club-dev`. Sin agregar `dynamodb:PutItem`, `dynamodb:GetItem` y `dynamodb:DeleteItem` sobre `activa-club-<env>` al rol de deploy —y `dynamodb:GetItem` al rol de solo lectura que corre el `plan`, que necesita leer el ítem para refrescar el estado— el pipeline falla con `AccessDenied`. `bootstrap` se aplica con credenciales elevadas **antes** de mergear el PR de esta historia, según el procedimiento de `docs/deployment/despliegue-dev.md` (ya pasó en los Sprints 1 y 2).

## Valor de negocio

Es el dato maestro sobre el que se apoyan la disponibilidad, el cálculo de aforo, la duración del bloque, el horario permitido y la exigencia de aprobación. Tenerlo como dato (y no como constante escondida en el código) es lo que permite después que el administrador edite aforo y horario sin desplegar (RN-ADM-04, US-036).

## Precondiciones

- Los endpoints de EP-04 están desplegados (US-027).
- El socio o administrador tiene sesión iniciada.

## Postcondiciones

- Existen los diez ítems `Resource` del catálogo mock en DynamoDB, con los valores de la tabla anterior.
- Cualquier socio autenticado puede consultarlos.

## Criterios de aceptación

1. Los diez recursos de la tabla anterior existen en DynamoDB creados por **Terraform** (`aws_dynamodb_table_item`, uno por recurso), con su `type`, `name`, `capacity`, `blockMinutes`, `opensAt`, `closesAt`, `requiresApproval` y `resourceStatus=AVAILABLE`, definidos una sola vez y aplicables tanto en `dev` como en `prd`.
2. La carga es **idempotente**: un segundo `apply` no duplica recursos ni pisa cambios que el administrador haya hecho después sobre aforo, horario o estado (US-036), gracias a `ignore_changes = [item]`.
3. `GET /resources` con token de rol `member` devuelve el catálogo completo con todos los campos del tipo `Resource`.
4. `GET /resources` con token de rol `admin` devuelve la misma información (el contrato lo autoriza para ambos roles).
5. `requiresApproval` es `true` únicamente para los recursos de tipo `PARRILLA` y `SALON_SOCIAL` (RN-RES-02); para el resto es `false` (RN-RES-01).
6. Los valores de `capacity` y `blockMinutes` de cada tipo coinciden exactamente con la tabla de recursos mock de `docs/product/reglas-de-negocio.md` §Módulo 4.
7. Los horarios devueltos respetan los horarios mock: club 06:00–22:00; piscina 08:00–20:00; parrillas y salón social 10:00–22:00.
8. Un recurso con `resourceStatus=MAINTENANCE` aparece en el catálogo marcado como tal, no desaparece de la lista.
9. Una llamada sin token devuelve 401 `UNAUTHENTICATED`.
10. El catálogo se lee de DynamoDB, no de constantes duplicadas en el frontend; el frontend consume el aforo, la duración y el horario que entrega la API.

## Casos alternativos / excepciones

- **Catálogo vacío** (ambiente nuevo cuyo `apply` todavía no corrió): `GET /resources` devuelve una lista vacía sin error, y la interfaz muestra su estado vacío. El catálogo forma parte del `apply` del ambiente, no de un paso manual aparte.
- **Recurso editado por el administrador**: el catálogo devuelve los valores vigentes en la base, no los del seed original, y el siguiente `apply` no los revierte.
- **Ítem borrado a mano de la tabla**: el siguiente `plan` lo detecta ausente y lo recrea con los valores del catálogo (se pierden las ediciones de runtime de ese recurso, no las de los demás).
- **Recurso agregado o retirado a futuro**: es un PR de infraestructura (agregar/quitar su `aws_dynamodb_table_item`), no un cambio de contrato ni un despliegue de código. El modelo usa un slug legible fijo por recurso.

## Sugerencia de pruebas funcionales

- R-27: `GET /resources` devuelve los diez recursos mock con aforo, duración de bloque, horario y `requiresApproval` coherentes con RN-RES.
- Ejecutar `apply` dos veces → sigue habiendo diez recursos y el segundo `plan` no propone cambios (idempotencia).
- Editar el aforo de un recurso con `PATCH /resources/{id}` (US-036), volver a correr `apply` y consultar `GET /resources` → el aforo editado **sigue vigente** (Terraform no lo revierte).
- Llamada sin token → 401.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES (recursos y horarios mock), RN-RES-01/02/09/11, RN-ADM-04.
- Casos de prueba: R-27, insumo de R-01, R-04, R-10, R-11, R-23.
- Depende de: US-027.
- Habilita: US-029, US-030, US-035, US-036.

## Decisión de carga del catálogo (decisión 2 de EP-04, cerrada)

Resuelta antes del Sprint Planning: el catálogo se carga como **ítems estáticos de Terraform**, según [ADR-0010](../../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md) y el detalle de las secciones anteriores de esta historia. Se descartaron la Lambda de _seed_, el script manual, extender la migración de socios (RN-MIG-03 migra socios, no instalaciones) y agregar un endpoint de alta de recursos: ese endpoint no existe en el contrato ni en la matriz de alcance y no debe crearse.

Sigue vigente lo que la historia exige funcionalmente: el catálogo **existe, es idempotente y no se pierde al redesplegar**, y el aforo y el horario se editan sin desplegar (RN-ADM-04).
