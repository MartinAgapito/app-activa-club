# US-027 — Provisionar endpoints e infraestructura de reservas

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-027                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Tarea técnica                                      |
| Responsable         | DevOps                                             |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Crítica                                            |
| Estimación relativa | 5                                                  |
| Dependencias        | —                                                  |

## Objetivo

Provisionar en Terraform la infraestructura de los trece endpoints serverless de recursos, reservas y resolución de participantes (API Gateway + Lambda por endpoint, log groups y alarmas), con el Cognito Authorizer cableado por rol según el contrato, de modo que backend y frontend puedan integrar el flujo de reservas contra el ambiente `dev` real.

## Entregable

Instanciación del módulo `modules/endpoint` (más `modules/log-group` y alarmas asociadas, [ADR-0008](../../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)) en `infrastructure/terraform/environments/dev/` para los endpoints de EP-04 definidos en `docs/api/contratos-api.md` §6 y §7, con los permisos IAM de mínimo privilegio que cada Lambda necesita sobre la tabla y sus índices. No incluye la lógica de negocio de las Lambdas (la implementan US-028 a US-036).

## Endpoints en alcance de esta historia

Recursos y disponibilidad (contrato §6):

- `GET /resources` (member, admin)
- `GET /resources/{resourceId}/availability` (member)
- `PATCH /resources/{resourceId}` (admin)
- `POST /resources/{resourceId}/maintenance` (admin)
- `DELETE /resources/{resourceId}/maintenance/{blockId}` (admin)

Reservas (contrato §7):

- `POST /reservations` (member)
- `GET /reservations` (member, admin)
- `GET /reservations/{reservationId}` (member, admin)
- `POST /reservations/{reservationId}/cancel` (member, admin)
- `POST /reservations/{reservationId}/approve` (admin)
- `POST /reservations/{reservationId}/reject` (admin)

Resolución de participantes por DNI (contrato §4 y §7, [ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)):

- `GET /members/lookup?dni=` (member, admin)
- `GET /guests/lookup?dni=` (member, admin)

Ambas son Lambdas de lectura puntual: necesitan `GetItem` sobre la tabla y **ningún** permiso sobre los GSI. `members/lookup` es un nodo estático hermano de `members/{memberId}` (mismo patrón ya desplegado que `members/me`, donde API Gateway prioriza el segmento exacto sobre el parámetro de ruta); `guests` es un nodo de primer nivel nuevo.

## Valor de negocio

Sin endpoints desplegados, ninguna historia funcional de EP-04 puede integrarse ni demostrarse extremo a extremo, y el socio que ya pagó su membresía en EP-03 sigue sin poder usar el club. Esta historia desbloquea el trabajo paralelo de backend y frontend sobre `dev` desde el primer día del sprint.

## Reglas de negocio

Habilita RN-RES-01..12 y RN-ADM-04/05/07. Autorización por rol según [ADR-0002](../../architecture/adr/ADR-0002-autenticacion-cognito-roles.md); estilo de API según [ADR-0004](../../architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md).

## Precondiciones

- La base de infraestructura de `dev` (DynamoDB con sus tres GSI, Cognito, API Gateway, CloudFront) está desplegada y operativa (Sprint 0, 1 y 2).
- No se requiere ningún proveedor externo ni secreto nuevo: EP-04 no integra servicios de terceros.

## Postcondiciones

- Los trece endpoints de EP-04 existen en API Gateway con su método, ruta, autorización y Lambda asociada.
- Cada Lambda tiene su rol IAM con los permisos mínimos sobre `AppTable` y los índices que realmente consulta.
- Cada Lambda tiene su log group y sus alarmas según ADR-0008.

## Criterios de aceptación

1. Cada endpoint listado en el alcance existe en API Gateway con su método, ruta y Lambda asociada, coherente con `docs/api/contratos-api.md` §4, §6 y §7.
2. La autorización por endpoint respeta la columna "Auth" del contrato usando el Cognito Authorizer y el claim `cognito:groups`: las rutas de administración (`PATCH /resources/{id}`, `maintenance`, `approve`, `reject`) no son alcanzables con un token de rol `member`.
3. Ningún endpoint de EP-04 es público: los trece requieren autenticación, incluidos los dos de resolución por DNI.
4. Las rutas con parámetros anidados (`/resources/{resourceId}/maintenance/{blockId}`, `/reservations/{reservationId}/cancel`) resuelven correctamente sus parámetros de ruta y no colisionan con las rutas hermanas ya desplegadas.
5. Cada Lambda tiene permiso IAM de mínimo privilegio sobre la tabla y **solo** sobre los índices que consulta; en particular, las Lambdas de disponibilidad, creación de reserva y consulta por recurso necesitan `Query` sobre **GSI3**, y las de listado del socio y superposición de participantes sobre **GSI1**. Se verifica explícitamente que el ARN de índices usado en `environments/dev` cubre GSI3 y no solo los índices que usaban las épicas anteriores.
6. La Lambda de creación de reserva tiene permiso de `TransactWriteItems` sobre la tabla (la reserva, sus participantes, los contadores de invitado y los perfiles de invitado se escriben de forma atómica, US-030/US-031).
7. Las Lambdas `members-lookup` y `guests-lookup` tienen **solo** `GetItem` sobre la tabla, sin acceso a ningún GSI: son lecturas puntuales por clave y su superficie debe quedar acotada al mínimo (ADR-0009).
8. `GET /members/lookup` y `GET /guests/lookup` tienen _throttling_ por método en el stage (`method_settings`), como mitigación del sondeo de DNIs previsto en ADR-0009; el contrato ya contempla `RATE_LIMITED`.
9. Cada Lambda tiene su log group con retención definida y las alarmas previstas por ADR-0008.
10. La configuración se define exclusivamente en Terraform; no requiere cambios manuales en la consola AWS.
11. El despliegue se realiza mediante GitHub Actions con OIDC, sin claves AWS estáticas.
12. `terraform plan` sobre `environments/dev` no rompe ni recrea recursos ya desplegados de EP-01, EP-02 ni EP-03.
13. Tras agregar trece rutas nuevas, el stage de API Gateway queda redesplegado y el comportamiento de CloudFront para `/api/*` sigue sirviendo tanto el SPA como la API (regresión conocida del Sprint 1).
14. La solución respeta el presupuesto AWS Free Tier: sin recursos siempre encendidos ni sobredimensionados.
15. No se implementa lógica de negocio en esta historia; las Lambdas pueden entregar un stub temporal reemplazado por las historias funcionales.

## Casos alternativos / excepciones

- Si el rol de despliegue de CI necesita un permiso nuevo, debe aplicarse primero `infrastructure/terraform/bootstrap` con credenciales elevadas **antes** de mergear el PR, según el procedimiento ya documentado en `docs/deployment/despliegue-dev.md`; de lo contrario `deploy-dev.yml` falla con `AccessDenied`. Ya ocurrió en los Sprints 1 y 2.
- Si el módulo `modules/endpoint` no soporta rutas con dos parámetros de ruta anidados, se documenta y ajusta el módulo antes de instanciar los endpoints de mantenimiento.
- Si el número de Lambdas nuevas impacta el tiempo de `apply`, se admite agrupar el despliegue en dos PR (recursos primero, reservas después) siempre que cada uno deje `dev` en estado consistente.

## Sugerencia de pruebas funcionales

- `terraform plan` sin cambios pendientes tras `apply` (idempotencia de la infraestructura).
- Llamada sin token a `POST /reservations` → 401.
- Llamada con token `member` a `POST /reservations/{id}/approve` → 403 (caso AD-06).
- Llamada con token `admin` a `GET /reservations` → autorizada.
- Llamada a `GET /resources/{id}/availability?date=...` con token `member` → alcanza la Lambda.
- Llamada a `GET /members/lookup?dni=...` con token `member` → alcanza la Lambda (no colisiona con `GET /members/{memberId}`, que sigue siendo solo de `admin`).

## Trazabilidad

- Épica: EP-04
- Reglas: habilita RN-RES-01..12, RN-ADM-04/05/07.
- Casos de prueba relacionados: AD-06 (superficie de autorización), R-01..R-29 (habilitados, no cubiertos aquí).
- Depende de: — (base de EP-01/EP-02/EP-03 desplegada).
- Habilita: US-028, US-029, US-030, US-031, US-033, US-034, US-035, US-036.
