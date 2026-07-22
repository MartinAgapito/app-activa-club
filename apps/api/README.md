# apps/api

Backend serverless de Activa Club — Node.js + TypeScript sobre AWS Lambda,
expuesto por Amazon API Gateway (REST), **una función Lambda por endpoint**
([ADR-0004](../../docs/architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md)).

> Sprint 0 (US-009) dejó el **scaffolding** del backend — estructura de
> carpetas, middleware compartido y el diseño del flujo de migración — más dos
> handlers de referencia (`GET /health`, `GET /members/me`) que demuestran el
> patrón a replicar (ver
> [docs/scrum/historias/US-009-modulos-backend-flujo-migracion.md](../../docs/scrum/historias/US-009-modulos-backend-flujo-migracion.md)).
> Sprint 1 (US-012) implementó la lógica funcional completa del flujo de
> migración y expuso `POST /admin/migration/run` (solo `admin`) como el primer
> endpoint con lógica de negocio real (ver
> [docs/scrum/historias/US-012-migracion-inicial-socios-dynamodb.md](../../docs/scrum/historias/US-012-migracion-inicial-socios-dynamodb.md)).
> **No** implementa todavía la lógica funcional del resto de dominios
> (activación, pagos, reservas, etc.): esos siguen siendo stubs `501` en
> Terraform hasta sus historias correspondientes de Sprint 1+.

## 1. Estructura de módulos

```
src/
  handlers/          # Una Lambda por endpoint (ADR-0004). Un archivo = un handler exportado.
    health/get.ts            # GET /health (público, sin datos) — plantilla mínima.
    members/get-me.ts        # GET /members/me (member) — auth + Query GSI1 + respuesta.
    admin/run-migration.ts   # POST /admin/migration/run (admin) — wiring del flujo de migración.
    (Sprint 1+: activation/, registration/, members/, payments/, resources/,
     reservations/, notifications/, dashboard/ — un archivo por endpoint de
     docs/api/contratos-api.md.)
  middleware/
    auth.ts            # Extrae identidad (`sub`, `roles`) del Cognito Authorizer; requireRole().
    with-handler.ts    # Envuelve cada handler: logging estructurado + manejo de errores.
  lib/
    dynamo.ts          # Cliente DynamoDB (singleton) + constructores de clave (modelo-dynamodb.md).
    errors.ts          # AppError + mapeo código de dominio -> status HTTP (contratos-api.md §1).
    http.ts             # Respuesta JSON de API Gateway + parseJsonBody/parseQuery con Zod.
    logger.ts          # Logger estructurado JSON para CloudWatch (ADR-0008).
    env.ts              # Acceso tipado a variables de entorno (.env.example).
  migration/
    transform.ts       # Transformación pura JSON on-premise -> ítems DynamoDB (sin AWS).
    repository.ts       # Persistencia idempotente (TransactWriteItems condicional).
    run.ts               # Orquestador: lee, valida por ítem, transforma, persiste, audita.
    fixtures/            # Fixtures ficticios de prueba (NO datos reales de socios).
  testing/
    fixtures.ts          # Constructores de eventos de API Gateway para pruebas de handlers.
```

Cada dominio funcional de `docs/api/contratos-api.md` mapea a una subcarpeta de
`src/handlers/`; cada archivo exporta un único `handler` (una función Lambda).
Los handlers **no** reimplementan validación, autorización, logging o manejo
de errores: usan `middleware/` y `lib/` para eso.

## 2. Patrón de un handler (a replicar en Sprint 1)

1. Tipar el evento con el tipo de `aws-lambda` que corresponda
   (`APIGatewayProxyEvent` para rutas públicas, `APIGatewayProxyWithCognitoAuthorizerEvent`
   para rutas `member`/`admin`).
2. Si la ruta requiere autenticación: `extractIdentity(event)` y
   `requireRole(identity, [...roles permitidos])` (`middleware/auth.ts`).
3. Si hay body/query: validarlo con un esquema de `@activa-club/validation`
   vía `parseJsonBody`/`parseQuery` (`lib/http.ts`) — nunca confiar en datos
   sin validar.
4. Ejecutar la lógica (acceso a DynamoDB vía `lib/dynamo.ts`, reglas de
   negocio del dominio) y devolver `jsonResponse(status, body)`.
5. Exportar `withHandler('NOMBRE_ACCION', laFuncion)` — agrega logging
   estructurado y traduce cualquier error a la respuesta estándar de
   `docs/api/contratos-api.md` §1.1.

Ver `src/handlers/health/get.ts` (mínimo, sin auth ni datos) y
`src/handlers/members/get-me.ts` (con auth + acceso a DynamoDB) como
plantillas completas.

## 3. Manejo de errores y logging

- **Errores de dominio**: lanzar `new AppError(code, message, details?)`
  (`lib/errors.ts`) con un `code` de `packages/shared-types` `ErrorCode`. El
  middleware `withHandler` traduce cualquier `AppError` al _shape_ estándar
  (`{ error: { code, message, details, requestId } }`) y al status HTTP de
  `docs/api/contratos-api.md` §1.2. Errores no controlados (`unknown`) se
  devuelven como `INTERNAL_ERROR` (500) sin exponer el mensaje original.
- **Logging**: `lib/logger.ts` emite una línea JSON por evento con los campos
  mínimos de [ADR-0008](../../docs/architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)
  (`timestamp`, `level`, `requestId`, `route`, `outcome`, `latencyMs`, etc.).
  `withHandler` ya registra entrada/salida de cada request; los handlers
  pueden añadir logs adicionales con `logger.info/warn/error`.
- **Auditoría** (acciones administrativas sensibles): se persiste como ítem
  `AuditLog` en DynamoDB, no solo en CloudWatch (ver `migration/run.ts` para
  el ejemplo de `MIGRATION_RUN`). Sprint 1 debe replicar este patrón para
  aprobar/rechazar socio, aprobar/rechazar reserva, mantenimiento de recurso y
  envío de notificaciones (ver tabla de trazabilidad en
  `docs/api/contratos-api.md` §11).

## 4. Autorización por rol

API Gateway valida el JWT con el Cognito Authorizer antes de invocar la
Lambda; el rol nunca se confía desde el cliente. `middleware/auth.ts`:

- `extractIdentity(event)`: lee `event.requestContext.authorizer.claims` y
  normaliza `sub`, `email` y `roles` (grupo(s) de `cognito:groups`).
- `requireRole(identity, ['admin'])` (o `['member']`, o ambos): lanza
  `FORBIDDEN` (403) si el rol autenticado no está permitido para la ruta,
  según la columna "Auth" de `docs/api/contratos-api.md`.

## 5. Acceso a datos (DynamoDB)

`lib/dynamo.ts` centraliza el cliente (`DynamoDBDocumentClient`, reutilizado
entre invocaciones) y los constructores de clave `keys.*`, uno por patrón de
`docs/data/modelo-dynamodb.md` §3. Ningún handler debe construir `PK`/`SK`/
`GSIxPK`/`GSIxSK` "a mano": siempre a través de `keys`, para que un cambio de
convención de clave se haga en un solo lugar.

## 6. Flujo de migración (`src/migration/`)

Implementación funcional (US-012) del diseño de
[docs/data/mapeo-migracion.md](../../docs/data/mapeo-migracion.md)
(RN-MIG-01..06), separado en tres módulos con una única responsabilidad cada
uno (fácil de probar sin AWS real):

1. **`transform.ts`** (puro, sin I/O): recibe un `LegacyMember` ya validado
   con `legacyMemberSchema` de `@activa-club/validation` y produce los 4
   ítems documentados (`Member`, `UniqueDni`, `UniqueEmail`,
   `MembershipPeriod`) con sus claves exactas de `modelo-dynamodb.md` §3.
   Incluye `deriveMembershipStatus` (tabla de mapeo-migracion.md §3, en zona
   `America/Lima` vía `Intl`, sin dependencias de fecha adicionales) y
   `limaDateOnly`.
   - **Decisión de implementación a confirmar con Arquitecto**: el ítem
     `Member` migrado se escribe **sin** `GSI1PK`/`GSI1SK` (resolución por
     `cognitoSub`), porque un socio recién migrado aún no tiene cuenta
     digital (`cognitoSub = null`). El GSI1 se completaría recién en
     `POST /activation/complete` (Sprint 1). `modelo-dynamodb.md` §3.1 no
     contempla explícitamente este caso.
2. **`repository.ts`**: persiste los 4 ítems de un socio en una única
   `TransactWriteItems`, con `ConditionExpression: attribute_not_exists(PK)`
   sobre `UniqueDni`/`UniqueEmail` para idempotencia (RT-10): reejecutar la
   migración con el mismo DNI no duplica al socio, se reporta como omitido.
3. **`run.ts`**: orquestador inyectable (`readSource`, `client`, `now` para
   pruebas deterministas). Valida primero la **envoltura** del JSON
   (`version`/`exportedAt`/`socios[]`) con `legacyExportEnvelopeSchema`; si es
   inválida, falla con `VALIDATION_ERROR` (400). Luego valida **cada socio**
   individualmente con `legacyMemberSchema`: los inválidos se acumulan en
   `rejectedItems` (con motivo, p. ej. `MISSING_EMAIL`) **sin abortar el
   lote** (mapeo-migracion.md §4). Al terminar, escribe un `AuditLog`
   (`action = MIGRATION_RUN`) con el resumen y devuelve el contrato de salida
   de mapeo-migracion.md §6 (`total`, `migrated`, `skipped`, `rejected`,
   `rejectedItems`, `runAt`).

El origen real del JSON es el bucket S3 de migración
([ADR-0005](../../docs/architecture/adr/ADR-0005-s3-migracion-activos-hosting.md)),
leído por `src/handlers/admin/run-migration.ts` (`POST /admin/migration/run`,
solo `admin`). Como `mock-data/` aún no tiene el JSON on-premise real (ver
`mock-data/README.md`), `src/migration/fixtures/legacy-export.sample.ts`
contiene un fixture mínimo **ficticio**, usado solo en pruebas, para validar
el diseño de la transformación.

## 7. Variables de entorno

Ver `.env.example` en la raíz del monorepo, sección `apps/api`. Nuevo en esta
historia: `MIGRATION_BUCKET_NAME` (bucket S3 de migración, `lib/env.ts`).

## 8. Pendiente para otras historias

- **Terraform**: los 10 endpoints admin/identidad provisionados en US-011
  (incluido `admin/migration/run`) despliegan por defecto el stub temporal
  `501` de `infrastructure/terraform/modules/endpoint` hasta que cada Lambda
  apunte `source_zip_path` al artefacto real de `apps/api` (fuera de alcance
  de este paquete; coordinar con Infraestructura/CI-CD el empaquetado y
  despliegue).
- **Backend (Sprint 1+)**: handlers funcionales completos de activación
  (US-013), registro (US-016), aprobación/rechazo de socios (US-017), perfil
  (US-018), membresías/pagos (Culqi + idempotencia, ADR-0007), reservas
  (cruces/aforo/invitados), notificaciones y dashboards, siguiendo el patrón
  de esta carpeta.
- **QA**: pruebas de integración contra API Gateway/DynamoDB reales (`docs/testing/`).

## 9. Scripts

```bash
npm run typecheck --workspace=@activa-club/api
npm run test --workspace=@activa-club/api
npm run build --workspace=@activa-club/api
```
