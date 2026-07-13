# Validación de contratos e integración planificada — cierre de Sprint 0 (US-010)

> Documento de cierre de la fundación técnica (EP-01, US-010). Verificación
> **estática** de consistencia entre contratos ([contratos-api.md](../api/contratos-api.md)),
> tipos/esquemas compartidos (`packages/shared-types`, `packages/validation`),
> los handlers de referencia del backend (`apps/api`), el cliente/ejemplos del
> frontend (`apps/web`) y la infraestructura (`infrastructure/terraform`).
>
> **Alcance**: Sprint 0 entregó solo fundación; la mayoría de los flujos de alto
> valor aún no tienen lógica de negocio. Por tanto esta validación es de
> **consistencia de contratos/tipos/infraestructura**, no de ejecución
> end-to-end real. Los flujos reales se validarán cuando exista implementación
> (Sprint 1+), según la sección 5.
>
> Integrador Técnico · Fuente de verdad de alcance: [Contexto Maestro](../product/contexto-maestro.md).

## 1. Resultado global

**Recomendación: cerrar Sprint 0.** No se detectaron bloqueos. La única fuente
de contratos entre frontend y backend son `packages/shared-types` (tipos) y
`packages/validation` (Zod), y ambos reflejan fielmente `docs/api/contratos-api.md`
y `docs/data/modelo-dynamodb.md`. Los hallazgos abiertos son de severidad
baja/media, no bloqueantes, y quedan listados con responsable en las secciones 4 y 6.

## 2. Consistencia verificada (alineado y listo)

### 2.1 Contratos ↔ tipos ↔ esquemas Zod

| Área | Contrato (docs/api) | `shared-types` | `validation` | Estado |
|------|---------------------|----------------|--------------|--------|
| Formato de error | §1.1 `{ error: { code, message, details?, requestId } }` | `ApiError`, `ApiErrorResponse`, `ErrorDetail` | (backend `lib/http.ts` mapea Zod → `details`) | OK |
| Códigos de error de dominio | §1.3 (24 códigos) | `ErrorCode` (24, idénticos) | — | OK |
| Códigos de estado HTTP | §1.2 | — | backend `lib/errors.ts` `STATUS_BY_CODE` (24, completo) | OK |
| Paginación | §1 `{ items, nextCursor }` | `Paginated<T>` | `paginationSchema` / `limit 1..100` | OK |
| Activación / registro | §3 | `VerifyDni*`, `CompleteActivation*`, `Registration*` | `verifyDniSchema`, `completeActivationSchema`, `registrationSchema` | OK |
| Socios | §4 | `Member`, `MemberSummary`, `UpdateMemberRequest`, `AutoRenewRequest`, `RejectMemberRequest` | `updateMemberSchema`, `autoRenewSchema`, `rejectMemberSchema`, `listMembersQuerySchema` | OK |
| Membresías / pagos | §5 | `MembershipPlan(s)`, `Payment`, `CreatePayment*` | `createPaymentSchema`, `paymentStatusSchema`, `listPaymentsQuerySchema` | OK |
| Recursos / disponibilidad | §6 | `Resource`, `Availability*`, `UpdateResourceRequest`, `CreateMaintenanceRequest`, `MaintenanceBlock` | `updateResourceSchema`, `createMaintenanceSchema`, `availabilityQuerySchema` | OK |
| Reservas | §7 | `Reservation`, `ReservationParticipant(Input)`, `CreateReservation*`, `CancelReservationResponse`, `RejectReservationRequest` | `createReservationSchema`, `reservationParticipantInputSchema`, `cancelReservationSchema`, `rejectReservationSchema`, `listReservationsQuerySchema` | OK |
| Notificaciones | §8 | `Notification`, `MemberNotification`, `CreateNotification*` | `notificationSegmentSchema`, `createNotificationSchema` | OK |
| Dashboards | §9 | `MemberDashboard`, `AdminDashboard` (+ sub-DTOs) | — (solo lectura) | OK |
| Migración | §10 | `Legacy*`, `MigrationResult`, `MigrationRejectedItem` | `legacyMemberSchema`, `legacyExportSchema`, `legacyExportEnvelopeSchema` | OK |
| Auditoría | ADR-0008 | `AuditLog`, `AuditAction` | — | OK |

Enums verificados idénticos en tipo y Zod: `MemberOrigin`, `MemberStatus`,
`MembershipType`, `MembershipStatus`, `PaymentStatus`, `ResourceType`,
`ResourceStatus`, `ReservationStatus`, `ParticipantType`, `NotificationSegment`,
`Role`, `Currency`. Reglas condicionales de negocio (GUEST requiere `dni`+`name`,
`SINGLE`→`targetMemberId`, `BY_RESOURCE`→`resourceId`) están en los `superRefine`
de Zod, coherentes con RN-RES/RN-NOT.

### 2.2 Backend (handlers de referencia) ↔ contrato

| Endpoint | Ruta/método contrato | Auth contrato | Handler | Estado |
|----------|----------------------|---------------|---------|--------|
| Salud | `GET /health` (público) | Público | `handlers/health/get.ts` → 200 `{status,timestamp}` | OK |
| Perfil propio | `GET /members/me` | `member` | `handlers/members/get-me.ts` → `requireRole(['member'])`, GSI1 por `cognitoSub` | OK con observación (4.3) |
| Migración | `POST /admin/migration/run` | `admin` | `handlers/admin/run-migration.ts` → `requireRole(['admin'])`, 202 `MigrationResult` | OK |

- Formato de error unificado: todo handler lanza `AppError(code)` y
  `toErrorResult` produce el shape §1.1 con `requestId`. Consistente.
- Autorización server-side vía `requireRole` sobre `cognito:groups`; nunca
  depende del frontend (ADR-0002/0004). Consistente.
- `parseJsonBody`/`parseQuery` validan entrada con los esquemas de
  `packages/validation` y traducen errores Zod a `details[]`. Consistente.

### 2.3 Frontend ↔ contratos

- `apps/web/src/lib/api/http-client.ts` consume `ApiErrorResponse` y `ErrorCode`
  de `@activa-club/shared-types`; normaliza errores al shape §1.1 e inyecta
  `Authorization: Bearer <token>` (placeholder de Cognito para Sprint 1). No
  inventa formas propias. OK.
- `apps/web/src/examples/reference-membership-plans.ts` usa exactamente
  `MembershipPlansResponse` y valores mock idénticos a §5. OK.
- `reference-form-schema.ts` es un ejemplo **deliberadamente genérico** del
  patrón RHF+Zod (no reutiliza `packages/validation`), documentado como tal; no
  representa un contrato de negocio. OK.
- Mapa de rutas (`routes/router.tsx`): cada ruta que consumirá datos tiene
  contrato correspondiente (dashboard socio/admin, membresía/pagos, reservas,
  notificaciones, perfil, gestión de socios/solicitudes/recursos/analytics).
  Login/activación/registro/recuperación se resuelven vía Cognito + endpoints de
  activación (§2/§3). Sin rutas huérfanas de contrato.

### 2.4 Modelo de datos ↔ Terraform ↔ código de acceso

| Elemento | modelo-dynamodb.md | Terraform (`modules/dynamodb-table`) | `apps/api/src/lib/dynamo.ts` | Estado |
|----------|--------------------|--------------------------------------|------------------------------|--------|
| Nombre físico | `activa-club-<env>` | `"${project}-${environment}"` | `getTableName()` ← `DYNAMODB_TABLE_NAME` | OK |
| Clave primaria | `PK` + `SK` (String) | `hash_key=PK`, `range_key=SK` | `keys.*` construyen `PK/SK` §3 | OK |
| GSI1/2/3 | proyección `ALL` | 3 GSI, `projection_type=ALL` | `GSI1/2/3PK/SK` en `keys.*` | OK |
| TTL | `expiresAt` (epoch) | `ttl { attribute_name="expiresAt" }` | idempotencia de pago (§3.6) | OK |
| Capacidad | On-demand | `PAY_PER_REQUEST` | — | OK |

Los 14 patrones de clave de `keys` (`member`, `uniqueDni/Email`,
`membershipPeriod`, `payment`, `paymentIdempotency`, `resource`, `reservation`,
`reservationParticipant`, `guestMonthlyCounter`, `maintenanceBlock`,
`notification`, `memberNotification`, `auditLog`) reflejan 1:1 la sección 3 del
modelo. `get-me.ts` usa el patrón #11 (GSI1 por `COGNITO#<sub>`). Consistente.

## 3. Criterios de aceptación de US-010

| CA | Descripción | Resultado |
|----|-------------|-----------|
| 1 | Cada ruta frontend con datos tiene contrato | Cumplido (2.3) |
| 2 | Cada contrato tiene módulo backend responsable | Cumplido a nivel de plan: 3 handlers de referencia + owners asignados a Sprint 1 (sección 5); no es un vacío, es fundación |
| 3 | Consistencia request/response, tipos, roles, errores | Cumplido (2.1–2.4), con hallazgos menores no bloqueantes (4) |
| 4 | Inconsistencias/vacíos documentados con acción | Cumplido (4 y 6) |
| 5 | `shared-types`/`validation` como única fuente de contratos | Cumplido y verificado |
| 6 | Conjunto de contratos listo (o pendientes acotados) para Sprint 1 | Cumplido (6) |
| 7 | Sin implementación funcional | Cumplido |

## 4. Hallazgos de integración (no bloqueantes)

Cada uno indica **origen · impacto · reproducción · responsable sugerido**.

### 4.1 `BUSINESS_RULE_VIOLATION` referenciado en §1.2 pero no es código de dominio real
- **Origen**: `docs/api/contratos-api.md` §1.2 (fila 422) menciona
  `BUSINESS_RULE_VIOLATION` como código de ejemplo, pero no está en §1.3 ni en
  `ErrorCode` (`shared-types`) ni en `STATUS_BY_CODE` (backend). Los 422 reales
  usan `MEMBER_HAS_DEBT`, `MEMBERSHIP_REQUIRED`, `CANCELLATION_TOO_LATE`, etc.
- **Impacto**: bajo — nomenclatura ilustrativa que podría confundir al
  implementar manejo de errores en Sprint 1.
- **Reproducción**: comparar §1.2 vs §1.3 vs `packages/shared-types/src/common.ts`.
- **Responsable sugerido**: Arquitecto (ajuste redaccional del contrato).

### 4.2 `POST /payments` documenta "402/422 PAYMENT_FAILED"; solo 422 está soportado
- **Origen**: §5 texto de errores cita "402/422". La tabla §1.2 no tiene fila
  402 y `STATUS_BY_CODE` mapea `PAYMENT_FAILED → 422`.
- **Impacto**: bajo — el frontend maneja por `error.code`, no por status; pero
  la ambigüedad debe cerrarse antes de implementar pagos.
- **Reproducción**: §5 vs `apps/api/src/lib/errors.ts`.
- **Responsable sugerido**: Arquitecto (fijar 422 en el contrato).

### 4.3 `GET /members/me` devuelve el ítem DynamoDB crudo (superset de `Member`)
- **Origen**: `apps/api/src/handlers/members/get-me.ts` hace
  `item as unknown as Member` y responde el ítem completo, que incluye claves
  internas (`PK`, `SK`, `GSI1PK/SK`, `GSI2PK/SK`, `entityType`) no presentes en
  el tipo `Member` del contrato.
- **Impacto**: medio — expone detalle de almacenamiento y el body es un superset
  del contrato. El propio handler lo marca con `TODO(Sprint 1)`.
- **Reproducción**: leer el handler; el ítem migrado (`migration/transform.ts`)
  contiene esas claves.
- **Responsable sugerido**: Backend — añadir un mapper/proyección
  (ítem DynamoDB → DTO `Member`) reutilizable, en Sprint 1, antes de exponer
  endpoints de lectura reales.

### 4.4 `Member` migrado sin `GSI1PK/GSI1SK` hasta la activación (confirmación del modelo)
- **Origen**: `apps/api/src/migration/transform.ts` omite deliberadamente
  `GSI1PK/GSI1SK` para socios migrados (`cognitoSub = null`); `modelo-dynamodb.md`
  §3.1 lista GSI1 para `Member` sin aclarar explícitamente que está ausente
  hasta enlazar Cognito en `POST /activation/complete`.
- **Impacto**: medio — decisión de implementación correcta (evita ítems en GSI1
  sin identidad), pero no está documentada en la fuente de verdad del modelo.
- **Reproducción**: comparar §3.1 con el comentario y la interfaz
  `MigratedMemberItem` (GSI1 opcional) del transform.
- **Responsable sugerido**: Arquitecto — añadir nota en §3.1
  (GSI1 se puebla solo tras activación) antes de Sprint 1. *(Hallazgo ya
  señalado por Backend en US-009.)*

## 5. Validación pendiente cuando exista implementación real (Sprint 1+)

La fundación no ejecuta flujos de negocio. Cuando cada flujo de alto valor tenga
handler + pantalla + infraestructura instanciada, el Integrador debe validar
end-to-end (contrato, roles, errores, permisos) según esta lista. Endpoints
contractualizados sin handler todavía (owner backend sugerido por flujo):

| Flujo de alto valor | Endpoints a implementar | Validación E2E a ejecutar |
|---------------------|-------------------------|---------------------------|
| Migración | `POST /admin/migration/run` (handler ya existe) | Ejecutar sobre tabla real dev; verificar `MigrationResult` y unicidad DNI/email |
| Activación por DNI | `POST /activation/verify`, `POST /activation/complete` | DNI migrado → cuenta Cognito, enlace `cognitoSub`, transición `MIGRATED→ACTIVE`, notificación `ACCOUNT_ACTIVATED`, poblado de GSI1 (ver 4.4) |
| Login | Cognito nativo (`InitiateAuth`) + `GET /members/me` | Token → resolución de socio por GSI1; roles `member`/`admin` correctos |
| Pago | `GET /memberships/plans`, `POST /payments`, `POST /payments/webhook` | Idempotencia (`idempotencyKey`), confirmación segura (§5/RN-PAG-07), sin datos de tarjeta al backend |
| Actualización de membresía | (efecto de `POST /payments` + webhook) | Membresía se actualiza **solo** al confirmar; refleja en `Member` y `MembershipPeriod` |
| Reserva | `POST /reservations`, `GET /resources/{id}/availability`, cancel/approve/reject | Todas las RN-RES server-side (deuda, cruces, aforo, invitado 2/mes, mantenimiento, 24h) |
| Notificación | `GET /notifications`, `POST /notifications`, read/sent | Inbox por socio + email SES condicionado a `alsoEmail` |
| Dashboard | `GET /dashboard/member`, `GET /dashboard/admin` | `canReserve` refleja RN-PAG-06/RN-RES-12; métricas RN-ANL-01..08 |

Además, en Sprint 1 se debe:
- Instanciar `module "endpoint"` en `environments/dev` (hoy es placeholder
  válido sin recursos) con `requires_auth`/`allowed_groups`/`environment_variables`
  (incl. `DYNAMODB_TABLE_NAME`, `MIGRATION_BUCKET_NAME`) y **Cognito Authorizer**.
- Cablear el `getAccessTokenProvider` del `http-client` a Cognito real.

## 6. Decisiones/pendientes consolidados para el arranque de Sprint 1

| # | Pendiente | Responsable | Referencia |
|---|-----------|-------------|------------|
| P1 | `Member` migrado sin GSI1 hasta activación: documentar en modelo §3.1 | Arquitecto | 4.4 / US-009 / `migration/transform.ts` |
| P2 | Precio/moneda de membresías mock; umbral de "próxima a vencer"; salir o no del sandbox de SES para la demo | Product Analyst | `docs/architecture/riesgos-tecnicos.md` (US-002) |
| P3 | `jsx-a11y` incompatible con ESLint 10 (no bloqueante; reincorporar cuando el plugin lo soporte) | Frontend / DevOps | US-008 |
| P4 | `npm run format:check` falla sobre ~46 archivos preexistentes (docs/ADR) por convención de tablas Markdown divergente previa a US-008 | Git Steward (coordina) + autores de docs | US-008 |
| P5 | Fijar `PAYMENT_FAILED` en 422 y retirar mención a 402 en §5 | Arquitecto | 4.2 |
| P6 | Retirar/aclarar `BUSINESS_RULE_VIOLATION` en §1.2 (no es código real) | Arquitecto | 4.1 |
| P7 | Añadir mapper ítem DynamoDB → DTO `Member` antes de exponer lecturas reales | Backend | 4.3 |

> Nota de umbral: el backend ya asume "próxima a vencer" = 7 días
> (`deriveMembershipStatus` en `migration/transform.ts`). P2 debe confirmar ese
> valor como oficial o corregirlo; hoy es una asunción de implementación, no una
> decisión de Product registrada.

## 7. Trazabilidad

- Cierra US-010 (EP-01). Depende de US-003, US-008, US-009 (completadas).
- Fuentes: `docs/api/contratos-api.md`, `docs/data/modelo-dynamodb.md`,
  `packages/shared-types/**`, `packages/validation/**`, `apps/api/**`,
  `apps/web/**`, `infrastructure/terraform/**`.
- Habilita el arranque paralelo de Sprint 1 con los pendientes P1–P7 acotados.
</content>
</invoke>
