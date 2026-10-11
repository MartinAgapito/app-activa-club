# ADR-0012 — La carga inicial de socios es una Lambda de invocación directa

- **Estado**: Aceptado
- **Fecha**: 2026-10-11
- **Decisores**: Product Owner (decisión de producto), Backend e Infraestructura
  (implementación)
- **Historia relacionada**: [US-012](../../scrum/historias/US-012-migracion-inicial-socios-dynamodb.md)
  (migración inicial); modifica lo entregado en
  [US-011](../../scrum/historias/US-011-provisionar-endpoints-identidad-acceso.md).
- **Relacionado**: [ADR-0004](./ADR-0004-api-gateway-rest-lambda-por-endpoint.md),
  [ADR-0005](./ADR-0005-s3-migracion-activos-hosting.md),
  [ADR-0008](./ADR-0008-observabilidad-logging-auditoria.md)

## Contexto

La migración se expuso como `POST /admin/migration/run` (API Gateway + Cognito
authorizer + rol `admin`). Pero es una operación de **operador, de una sola
vez** (carga inicial del JSON on-premise), no una función de la aplicación: no
hay pantalla que la use ni un caso de uso recurrente para un administrador.
Mantenerla como endpoint dejaba una ruta pública (autenticada) capaz de escribir
masivamente en la tabla, sin aportar nada a ningún usuario.

## Decisión

La migración pasa a ser la **Lambda `migration-run`**
(`activa-club-<env>-migration-run`), invocada directamente (consola de Lambda o
`aws lambda invoke`):

- **Sin API Gateway, sin ruta y sin payload.** Ignora el evento, lee
  `legacy-export.json` del bucket de migración (ADR-0005) y ejecuta la lógica de
  siempre (`src/migration/run.ts`: validación, transformación, persistencia
  idempotente, `AuditLog`, resumen). Devuelve el resumen como valor de retorno
  y falla visiblemente si el JSON no existe o es inválido.
- **Autorización por IAM**: solo una identidad con `lambda:InvokeFunction` sobre
  la función puede ejecutarla.
- **Auditoría**: `actorId = migration-operator`, `actorRole = system`
  (`AuditActorRole = Role | 'system'` en `packages/shared-types`).
- **Terraform**: instancia de `modules/scheduled-job` con
  `schedule_expression = null` (sin regla/target/permiso de EventBridge), sin
  alarma de errores (se invoca a mano y el operador ve el resultado al
  instante), timeout de 300 s e IAM mínimo (`s3:GetObject` sobre el bucket de
  migración y `dynamodb:PutItem` sobre la tabla). Se reutilizó el módulo en vez
  de crear uno nuevo: el cambio es mínimo y compatible hacia atrás (bloques
  `moved`; el plan de `memberships-expire` no cambia).

## Alternativas consideradas

- **Mantener el endpoint admin.** Rechazada: superficie de ataque innecesaria
  para una operación única.
- **Módulo `lambda-function` nuevo.** Descartada por duplicar casi por completo
  a `scheduled-job` (rol, log group, política de logs, función).

## Consecuencias

- **A favor**: sin endpoint público ni ruta autenticada que proteger; la
  superficie HTTP baja de 30 a 29 endpoints; el permiso es explícito y
  auditable en IAM.
- **En contra**: se pierde el rol `admin` de la aplicación como control y la
  migración **no es invocable desde la web**; hace falta acceso a la cuenta AWS.
- **Pruebas**: el caso "un no-admin recibe `403`" deja de aplicar y se
  reemplaza por "solo identidades IAM con `lambda:InvokeFunction` pueden
  ejecutarla".
- **Despliegue en dos fases**: el deployment/stage de API Gateway registran en
  su estado una dependencia del módulo del endpoint viejo; quitarlo en el mismo
  `apply` que reemplaza el deployment produce `Error: Cycle`. La fase 1
  (desacoplar del deployment y crear la nueva Lambda) y la fase 2 (destruir el
  módulo viejo, ruta y Lambda) van en `apply` separados.
