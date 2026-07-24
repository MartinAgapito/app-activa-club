# Modelo de datos DynamoDB — Activa Club

> Fuente de verdad del modelo de datos. Ningún nombre de tabla, atributo, índice
> o clave puede usarse en código sin estar documentado aquí primero (norma de
> ingeniería del [Contexto Maestro](../product/contexto-maestro.md)). Diseño
> single-table justificado en
> [ADR-0003](../architecture/adr/ADR-0003-dynamodb-single-table.md). Cubre todas
> las reglas de [reglas-de-negocio.md](../product/reglas-de-negocio.md).

## 1. Tabla

- **Nombre lógico**: `AppTable`.
- **Nombre físico**: `activa-club-<env>` (env = `dev` | `prd`).
- **Modo de capacidad**: On-demand (pay-per-request).
- **Clave primaria**: `PK` (partition, String) + `SK` (sort, String).
- **TTL**: atributo `expiresAt` (epoch segundos) para ítems efímeros (idempotencia).
- **GSI**: tres índices genéricos sobrecargados: `GSI1`, `GSI2`, `GSI3`
  (proyección `ALL`).

### Atributos de indexación

| Atributo           | Tipo   | Uso                                                  |
| ------------------ | ------ | ---------------------------------------------------- |
| `PK`, `SK`         | String | Clave primaria                                       |
| `GSI1PK`, `GSI1SK` | String | GSI1 — resolución por identidad / por sujeto (owner) |
| `GSI2PK`, `GSI2SK` | String | GSI2 — listados por estado (admin / analytics)       |
| `GSI3PK`, `GSI3SK` | String | GSI3 — reservas y bloqueos por recurso y tiempo      |
| `entityType`       | String | Discriminador de tipo de item                        |
| `expiresAt`        | Number | TTL (solo ítems efímeros)                            |

## 2. Convenciones

- **IDs generados**: ULID (ordenables por tiempo) para `memberId`, `paymentId`,
  `reservationId`, `notificationId`, `auditId`, `blockId`.
- **IDs de recurso**: slug legible fijo (mock): `futbol-1`, `futbol-2`,
  `tenis-1`, `tenis-2`, `padel-1`, `padel-2`, `piscina-1`, `parrilla-1`,
  `parrilla-2`, `salon-social`.
- **Fechas**: se almacenan en **UTC ISO-8601** (`2026-07-09T15:00:00Z`). Las
  reglas de negocio con calendario (cancelación 24h, expiración, mes del
  invitado) se evalúan en zona `America/Lima`.
- **Enums**: en MAYÚSCULAS con guion bajo. Ver
  [diccionario-de-datos.md](./diccionario-de-datos.md).

## 3. Entidades e ítems

Notación: `<...>` = valor dinámico. `entityType` en negrita.

### 3.1 Socio — **Member**

| Campo           | Valor                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| PK              | `MEMBER#<memberId>`                                                           |
| SK              | `PROFILE`                                                                     |
| GSI1PK / GSI1SK | `COGNITO#<cognitoSub>` / `MEMBER` (resolver socio tras login)                 |
| GSI2PK / GSI2SK | `MEMBER#STATUS#<memberStatus>` / `<createdAt>#<memberId>` (listar por estado) |

Atributos: `memberId`, `legacyId` (nullable; solo migrados), `dni`, `email`,
`firstName`, `lastName`, `phone`, `origin` (`MIGRATED`|`NEW`), `memberStatus`
(`MIGRATED`|`PENDING`|`APPROVED`|`REJECTED`|`ACTIVE`), `cognitoSub` (nullable
hasta activar), `rejectionReason` (nullable), `createdAt`, `updatedAt`.
Membresía denormalizada (estado actual): `membershipType`
(`MONTHLY`|`ANNUAL`|null), `membershipStatus`
(`ACTIVE`|`EXPIRING_SOON`|`EXPIRED`|`DEBT`|`NONE`), `membershipStartedAt`,
`membershipEndsAt`, `outstandingBalance` (número, moneda menor), `autoRenew`
(boolean).

### 3.2 Unicidad de DNI — **UniqueDni**

| Campo | Valor            |
| ----- | ---------------- |
| PK    | `UNIQ#DNI#<dni>` |
| SK    | `UNIQ#DNI#<dni>` |

Atributos: `memberId`. Creado con `TransactWriteItems` +
`attribute_not_exists(PK)`. Garantiza RN-ACT-03 (un DNI = una cuenta) y sirve de
lookup en activación (`GetItem` por DNI → `memberId`).

### 3.3 Unicidad de email — **UniqueEmail**

| Campo | Valor                     |
| ----- | ------------------------- |
| PK    | `UNIQ#EMAIL#<emailLower>` |
| SK    | `UNIQ#EMAIL#<emailLower>` |

Atributos: `memberId`. Misma técnica transaccional. Evita correos duplicados.

### 3.4 Historial de membresía — **MembershipPeriod**

| Campo           | Valor                                                            |
| --------------- | ---------------------------------------------------------------- |
| PK              | `MEMBER#<memberId>`                                              |
| SK              | `MEMBERSHIP#<startedAt>#<membershipId>`                          |
| GSI2PK / GSI2SK | `MEMBERSHIP#ACTIVE` / `<endsAt>` (solo si vigente; expiraciones) |

Atributos: `membershipId`, `type` (`MONTHLY`|`ANNUAL`), `startedAt`, `endsAt`,
`status`, `paymentId` (origen), `createdAt`. Guarda cada período pagado/renovado
(RN-PAG-01/03). El estado vigente también vive denormalizado en el Member para
lecturas rápidas del dashboard. El índice `GSI2` de expiración habilita
"próximas a vencer / vencidas" (RN-ANL-02).

### 3.5 Pago — **Payment**

| Campo           | Valor                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| PK              | `MEMBER#<memberId>`                                                               |
| SK              | `PAYMENT#<createdAt>#<paymentId>`                                                 |
| GSI2PK / GSI2SK | `PAYMENT#STATUS#<paymentStatus>` / `<createdAt>#<paymentId>` (analytics de pagos) |

Atributos: `paymentId`, `memberId`, `membershipType`, `amount`, `currency`
(`PEN`), `paymentStatus` (`PENDING_CONFIRMATION`|`SUCCEEDED`|`FAILED`),
`culqiChargeId` (nullable), `idempotencyKey`, `autoRenewRequested` (boolean),
`failureReason` (nullable), `createdAt`, `confirmedAt` (nullable). **Nunca** PAN,
CVV ni secretos (RN-PAG-08). Historial por socio: `Query` PK=`MEMBER#<id>`,
`begins_with(SK,"PAYMENT#")`. Analytics de pagos exitosos/fallidos: `GSI2`.

### 3.6 Idempotencia de pago — **PaymentIdempotency**

| Campo | Valor                    |
| ----- | ------------------------ |
| PK    | `IDEMP#<idempotencyKey>` |
| SK    | `IDEMP#<idempotencyKey>` |

Atributos: `paymentId`, `paymentStatus`, `expiresAt` (TTL). Escrito con
`attribute_not_exists` antes de cobrar; si existe, se devuelve el resultado
previo (evita doble cargo, RT-01). Ver
[ADR-0007](../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).

### 3.7 Recurso — **Resource**

| Campo | Valor                   |
| ----- | ----------------------- |
| PK    | `RESOURCE#<resourceId>` |
| SK    | `METADATA`              |

Atributos: `resourceId`, `type` (`FUTBOL`|`TENIS`|`PADEL`|`PISCINA`|`PARRILLA`|
`SALON_SOCIAL`), `name`, `capacity`, `blockMinutes`, `opensAt` (`HH:mm`),
`closesAt` (`HH:mm`), `requiresApproval` (boolean), `resourceStatus`
(`AVAILABLE`|`MAINTENANCE`), `createdAt`, `updatedAt`. Aforos/horarios/duración
mock según RN-RES (fútbol 90/14, tenis 60/4, pádel 90/4, piscina 120/5, parrilla
300/12, salón 240/30). `requiresApproval = true` solo para `PARRILLA` y
`SALON_SOCIAL` (RN-RES-02). Admin edita aforo/horario/estado (RN-ADM-04).

### 3.8 Reserva (cabecera) — **Reservation**

| Campo           | Valor                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------- |
| PK              | `RESERVATION#<reservationId>`                                                                                  |
| SK              | `METADATA`                                                                                                     |
| GSI1PK / GSI1SK | `MEMBER#<holderMemberId>` / `RES#<startsAt>#<reservationId>` (reservas del socio)                              |
| GSI2PK / GSI2SK | `RESERVATION#STATUS#<reservationStatus>` / `<startsAt>#<reservationId>` (pendientes de aprobación / analytics) |
| GSI3PK / GSI3SK | `RESOURCE#<resourceId>` / `SLOT#<startsAt>#<reservationId>` (cruces / disponibilidad / ocupación)              |

Atributos: `reservationId`, `resourceId`, `resourceType`, `holderMemberId`,
`startsAt`, `endsAt`, `reservationStatus` (`CONFIRMED`|`PENDING_APPROVAL`|
`APPROVED`|`REJECTED`|`CANCELLED`), `participantCount`, `guestCount`,
`requiresApproval`, `rejectionReason` (nullable), `cancelledAt` (nullable),
`createdAt`, `updatedAt`.

- **Cruces por recurso (RN-RES-07)**: `Query` GSI3 PK=`RESOURCE#<id>`, rango de
  `startsAt` que solape → si hay reserva activa que se traslapa, se rechaza.
- **Disponibilidad**: misma consulta GSI3 para pintar franjas libres.
- **Confirmación**: `CONFIRMED` automático para fútbol/tenis/pádel/piscina;
  `PENDING_APPROVAL` para parrillas/salón (RN-RES-01/02).
- **Reservas del socio (dashboard)**: `Query` GSI1 PK=`MEMBER#<id>`,
  `begins_with(GSI1SK,"RES#")`.
- **Pendientes de aprobación (admin)**: `Query` GSI2
  PK=`RESERVATION#STATUS#PENDING_APPROVAL` (RN-ANL-05).

### 3.9 Participante de reserva — **ReservationParticipant**

| Campo           | Valor                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- |
| PK              | `RESERVATION#<reservationId>`                                                         |
| SK              | `PARTICIPANT#<participantId>`                                                         |
| GSI1PK / GSI1SK | `SUBJECT#<subjectKey>` / `PART#<startsAt>#<reservationId>` (superposición por sujeto) |

Atributos: `participantId`, `reservationId`, `participantType`
(`HOLDER`|`MEMBER`|`GUEST`), `subjectKey` (`MEMBER#<memberId>` o
`GUEST#<guestDni>`), `memberId` (nullable), `guestDni` (nullable), `guestName`
(nullable), `startsAt`, `endsAt`, `createdAt`.

- **Superposición de participantes (RN-RES-08)**: `Query` GSI1
  PK=`SUBJECT#<subjectKey>`, rango de `startsAt` solapado → un socio o invitado no
  puede estar en dos reservas que se cruzan.
- El titular se guarda como participante `HOLDER` además de `holderMemberId` en
  la cabecera (RN-RES-06).

### 3.10 Contador mensual de invitado — **GuestMonthlyCounter**

| Campo | Valor              |
| ----- | ------------------ |
| PK    | `GUEST#<guestDni>` |
| SK    | `MONTH#<yyyy-mm>`  |

Atributos: `guestDni`, `month`, `visitCount`, `reservationIds` (lista),
`updatedAt`. Incremento atómico con condición `visitCount < 2` para garantizar el
**máximo de 2 visitas/mes por invitado externo** (RN-RES-05). El mes se calcula
en zona `America/Lima`. Al cancelar una reserva, se decrementa.

### 3.11 Bloqueo por mantenimiento — **MaintenanceBlock**

| Campo           | Valor                                                                          |
| --------------- | ------------------------------------------------------------------------------ |
| PK              | `RESOURCE#<resourceId>`                                                        |
| SK              | `MAINT#<startsAt>#<blockId>`                                                   |
| GSI3PK / GSI3SK | `RESOURCE#<resourceId>` / `SLOT#<startsAt>#<blockId>` (colisiona con reservas) |

Atributos: `blockId`, `resourceId`, `startsAt`, `endsAt`, `reason`, `createdBy`
(adminId), `createdAt`. El administrador bloquea temporalmente un recurso
(RN-RES-11). Al compartir el índice GSI3 con las reservas, el cálculo de
disponibilidad y cruces considera automáticamente los bloqueos.

### 3.12 Notificación (registro emitido) — **Notification**

| Campo           | Valor                                                                        |
| --------------- | ---------------------------------------------------------------------------- |
| PK              | `NOTIFICATION#<notificationId>`                                              |
| SK              | `METADATA`                                                                   |
| GSI2PK / GSI2SK | `NOTIFICATION#SENT` / `<createdAt>#<notificationId>` (analytics de enviadas) |

Atributos: `notificationId`, `title`, `body`, `segment`
(`ALL`|`ACTIVE`|`DEBT`|`EXPIRED`|`EXPIRING_SOON`|`SINGLE`|`BY_RESOURCE`),
`targetMemberId` (nullable), `resourceId` (nullable), `event` (nullable; para
eventos automáticos, ver diccionario), `alsoEmail` (boolean), `createdBy`
(adminId | `SYSTEM`), `recipientCount`, `createdAt`. Analytics "notificaciones
enviadas" (RN-ANL-08) vía GSI2. Segmentación RN-NOT-03.

### 3.13 Notificación por socio (inbox) — **MemberNotification**

| Campo | Valor                                |
| ----- | ------------------------------------ |
| PK    | `MEMBER#<memberId>`                  |
| SK    | `NOTIF#<createdAt>#<notificationId>` |

Atributos: `notificationId`, `memberId`, `title`, `body`, `event` (nullable),
`readStatus` (`UNREAD`|`READ`), `createdAt`, `readAt` (nullable). Inbox del socio
(RN-NOT-01, obligatorio): `Query` PK=`MEMBER#<id>`, `begins_with(SK,"NOTIF#")`.

### 3.14 Auditoría administrativa — **AuditLog**

| Campo | Valor                   |
| ----- | ----------------------- |
| PK    | `AUDIT#<yyyy-mm-dd>`    |
| SK    | `<timestamp>#<auditId>` |

Atributos: `auditId`, `actorId`, `actorRole`, `action` (p. ej.
`MEMBER_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_MAINTENANCE`,
`NOTIFICATION_SENT`, `MIGRATION_RUN`), `targetType`, `targetId`, `metadata`
(mapa), `timestamp`. Registro de acciones administrativas
([ADR-0008](../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)).
Consulta cronológica por día: `Query` PK=`AUDIT#<fecha>`.

## 4. Índices y patrones de acceso (resumen)

### Tabla base (PK/SK)

| #   | Patrón de acceso                  | Consulta                                                        | Regla        |
| --- | --------------------------------- | --------------------------------------------------------------- | ------------ |
| 1   | Obtener socio por id              | `GetItem` PK=`MEMBER#<id>`, SK=`PROFILE`                        | RN-ADM-01    |
| 2   | Buscar socio por DNI (activación) | `GetItem` PK=`UNIQ#DNI#<dni>` → memberId                        | RN-ACT-01/03 |
| 3   | Historial de pagos del socio      | `Query` PK=`MEMBER#<id>`, `begins_with(SK,"PAYMENT#")`          | RN-ADM-07    |
| 4   | Historial de membresías del socio | `Query` PK=`MEMBER#<id>`, `begins_with(SK,"MEMBERSHIP#")`       | RN-PAG-01    |
| 5   | Inbox de notificaciones del socio | `Query` PK=`MEMBER#<id>`, `begins_with(SK,"NOTIF#")`            | RN-NOT-01    |
| 6   | Idempotencia de pago              | `GetItem`/`Put condicional` PK=`IDEMP#<key>`                    | RN-PAG-07    |
| 7   | Unicidad DNI/email                | `TransactWrite` `attribute_not_exists`                          | RN-ACT-03    |
| 8   | Participantes de una reserva      | `Query` PK=`RESERVATION#<id>`, `begins_with(SK,"PARTICIPANT#")` | RN-RES-06    |
| 9   | Contador mensual de invitado      | `Update` condicional PK=`GUEST#<dni>`, SK=`MONTH#<yyyy-mm>`     | RN-RES-05    |
| 10  | Auditoría por día                 | `Query` PK=`AUDIT#<fecha>`                                      | RN-ADM       |

### GSI1 — identidad / sujeto (owner)

| #   | Patrón                         | Consulta                                                   | Regla     |
| --- | ------------------------------ | ---------------------------------------------------------- | --------- |
| 11  | Resolver socio tras login      | `Query` GSI1PK=`COGNITO#<sub>`                             | RN-ACT-04 |
| 12  | Reservas de un socio           | `Query` GSI1PK=`MEMBER#<id>`, `begins_with(GSI1SK,"RES#")` | Dashboard |
| 13  | Superposición por participante | `Query` GSI1PK=`SUBJECT#<subjectKey>`, rango `startsAt`    | RN-RES-08 |

### GSI2 — por estado (admin / analytics)

| #   | Patrón                                  | Consulta                                              | Regla                |
| --- | --------------------------------------- | ----------------------------------------------------- | -------------------- |
| 14  | Socios por estado (p. ej. pendientes)   | `Query` GSI2PK=`MEMBER#STATUS#<status>`               | RN-ADM-02, RN-ANL-01 |
| 15  | Membresías próximas a vencer / vencidas | `Query` GSI2PK=`MEMBERSHIP#ACTIVE`, rango `endsAt`    | RN-ANL-02            |
| 16  | Pagos por estado (exitosos/fallidos)    | `Query` GSI2PK=`PAYMENT#STATUS#<status>`              | RN-ANL-06            |
| 17  | Reservas pendientes de aprobación       | `Query` GSI2PK=`RESERVATION#STATUS#PENDING_APPROVAL`  | RN-ANL-05            |
| 18  | Notificaciones enviadas                 | `Query` GSI2PK=`NOTIFICATION#SENT`, rango `createdAt` | RN-ANL-08            |

### GSI3 — reservas/bloqueos por recurso y tiempo

| #   | Patrón                                     | Consulta                                                  | Regla           |
| --- | ------------------------------------------ | --------------------------------------------------------- | --------------- |
| 19  | Cruces por recurso                         | `Query` GSI3PK=`RESOURCE#<id>`, rango `startsAt` solapado | RN-RES-07/09    |
| 20  | Disponibilidad de un recurso por fecha     | `Query` GSI3PK=`RESOURCE#<id>`, rango del día             | RN-RES-01       |
| 21  | Reservas por instalación / día / ocupación | `Query` GSI3PK=`RESOURCE#<id>`, rango                     | RN-ANL-03/04/07 |
| 22  | Colisión con mantenimiento                 | Incluida en 19/20 (mismo índice)                          | RN-RES-11       |

## 5. Cobertura de reglas críticas

| Regla                                         | Cómo la soporta el modelo                                                                   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| RN-ACT-03 (un DNI, una cuenta)                | Ítems de unicidad `UNIQ#DNI#` con escritura condicional                                     |
| RN-PAG-06 (deuda no reserva)                  | `membershipStatus`/`outstandingBalance` en Member; validado antes de crear reserva          |
| RN-PAG-07 (confirmación segura)               | Estado de pago `PENDING_CONFIRMATION`→`SUCCEEDED`; membresía se actualiza solo al confirmar |
| RN-PAG-08 (sin datos sensibles)               | Payment no almacena PAN/CVV/secretos; solo `culqiChargeId`                                  |
| RN-RES-05 (invitado 2/mes)                    | `GuestMonthlyCounter` con condición `visitCount < 2`                                        |
| RN-RES-07 (sin cruces por recurso)            | GSI3 por recurso + rango de tiempo                                                          |
| RN-RES-08 (sin superposición de participante) | GSI1 por `SUBJECT#` + rango de tiempo                                                       |
| RN-RES-09 (aforo)                             | `capacity` del recurso vs. `participantCount`                                               |
| RN-RES-10 (cancelar 24h antes)                | Regla sobre `startsAt` vs. ahora (America/Lima)                                             |
| RN-RES-11 (mantenimiento)                     | `MaintenanceBlock` en GSI3 (colisiona con reservas)                                         |
| RN-RES-12 (solo activos sin deuda)            | `memberStatus=ACTIVE` y `membershipStatus∉{DEBT,EXPIRED}`                                   |

## 6. Referencias

- [Diccionario de datos](./diccionario-de-datos.md)
- [Mapeo de migración](./mapeo-migracion.md)
- [Contratos de API](../api/contratos-api.md)
- [ADR-0003 single-table](../architecture/adr/ADR-0003-dynamodb-single-table.md)
