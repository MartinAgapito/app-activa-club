# Contratos de API — Activa Club

> Contratos REST iniciales del MVP. Definición, no implementación. Alineados con
> el [modelo de datos](../data/modelo-dynamodb.md), las
> [reglas de negocio](../product/reglas-de-negocio.md) y los tipos de
> `packages/shared-types` / esquemas de `packages/validation`. Estilo REST sobre
> API Gateway + Lambda por endpoint
> ([ADR-0004](../architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md)).

## 1. Convenciones generales

- **Base URL**: `https://<api>/api` (prefijo `/api`). Versionado futuro por path.
- **Formato**: JSON (`Content-Type: application/json`). Fechas ISO-8601 UTC.
  Montos en **céntimos** (enteros).
- **Autenticación**: JWT de Cognito en `Authorization: Bearer <token>`. API
  Gateway valida con Cognito Authorizer; el rol proviene del claim
  `cognito:groups` (`member` | `admin`)
  ([ADR-0002](../architecture/adr/ADR-0002-autenticacion-cognito-roles.md)).
- **Autorización por endpoint**: columna "Auth" en cada tabla:
  `Público`, `member`, `admin`, `member|admin`.
- **Paginación**: cursor opaco. Query `?cursor=<opaque>&limit=<n>`; respuesta
  incluye `{ items, nextCursor }`.
- **Idempotencia**: endpoints de cobro requieren `idempotencyKey` en el body.

### 1.1 Formato de error estándar

Todas las respuestas de error usan el mismo shape
([ADR-0008](../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)):

```json
{
  "error": {
    "code": "RESERVATION_OVERLAP",
    "message": "El recurso ya está reservado en ese horario.",
    "details": [{ "field": "startsAt", "issue": "overlaps existing reservation" }],
    "requestId": "8f3c1e2a-..."
  }
}
```

### 1.2 Códigos de estado

| Código | Uso                                                                                         |
| ------ | ------------------------------------------------------------------------------------------- |
| 200    | OK                                                                                          |
| 201    | Recurso creado                                                                              |
| 202    | Aceptado (procesamiento asíncrono, p. ej. migración/webhook)                                |
| 204    | OK sin contenido                                                                            |
| 400    | Error de validación de entrada (`VALIDATION_ERROR`)                                         |
| 401    | No autenticado (`UNAUTHENTICATED`)                                                          |
| 403    | Autenticado sin permiso de rol (`FORBIDDEN`)                                                |
| 404    | No encontrado (`NOT_FOUND`)                                                                 |
| 409    | Conflicto: unicidad, cruces, estado (`CONFLICT`, `RESERVATION_OVERLAP`, `DNI_ALREADY_USED`) |
| 422    | Regla de negocio no satisfecha (`BUSINESS_RULE_VIOLATION`, p. ej. deuda, <24h)              |
| 429    | Límite excedido (`RATE_LIMITED`, `GUEST_MONTHLY_LIMIT`)                                     |
| 500    | Error interno (`INTERNAL_ERROR`)                                                            |

### 1.3 Códigos de error de dominio (`error.code`)

`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
`DNI_ALREADY_USED`, `EMAIL_ALREADY_USED`, `DNI_NOT_FOUND`, `ALREADY_ACTIVATED`,
`MEMBER_NOT_APPROVED`, `PAYMENT_FAILED`, `PAYMENT_DUPLICATE`,
`MEMBERSHIP_REQUIRED`, `MEMBER_HAS_DEBT`, `RESERVATION_OVERLAP`,
`PARTICIPANT_OVERLAP`, `CAPACITY_EXCEEDED`, `GUEST_MONTHLY_LIMIT`,
`OUTSIDE_SCHEDULE`, `RESOURCE_IN_MAINTENANCE`, `CANCELLATION_TOO_LATE`,
`RESERVATION_NOT_PENDING`, `RATE_LIMITED`, `INTERNAL_ERROR`.

## 2. Autenticación (Cognito nativo)

Login, refresh, logout y recuperación de contraseña se realizan **directamente
con Cognito** (SDK/Amplify o Hosted UI), no como endpoints propios:

| Operación                 | Mecanismo Cognito                                               |
| ------------------------- | --------------------------------------------------------------- |
| Login (correo+contraseña) | `InitiateAuth` (`USER_PASSWORD_AUTH`) → ID/Access/Refresh token |
| Refresh de sesión         | `InitiateAuth` (`REFRESH_TOKEN_AUTH`)                           |
| Recuperar contraseña      | `ForgotPassword` + `ConfirmForgotPassword`                      |
| Cerrar sesión             | `GlobalSignOut` / descartar tokens                              |

El backend **no** expone `/login`. El alta de usuarios Cognito ocurre dentro de
activación y registro (abajo), vía Admin API server-side.

## 3. Activación y registro (RN-ACT)

| Método | Ruta                   | Auth    | Descripción                                             |
| ------ | ---------------------- | ------- | ------------------------------------------------------- |
| POST   | `/activation/verify`   | Público | Verifica DNI de socio migrado                           |
| POST   | `/activation/complete` | Público | Completa activación: crea cuenta Cognito y enlaza socio |
| POST   | `/registration`        | Público | Registra socio nuevo (estado `PENDING`)                 |

### POST /activation/verify

Request:

```json
{ "dni": "45678912" }
```

Response 200:

```json
{ "eligible": true, "memberId": "01J...", "firstName": "María", "maskedEmail": "m***@example.com" }
```

Errores: 404 `DNI_NOT_FOUND` (no existe socio migrado con ese DNI); 409
`ALREADY_ACTIVATED` (ya tiene cuenta digital).

### POST /activation/complete

Request:

```json
{ "dni": "45678912", "email": "maria.quispe@example.com", "password": "••••••••" }
```

- Valida DNI elegible, crea usuario en Cognito (grupo `member`), enlaza
  `cognitoSub`, transiciona `memberStatus` (`MIGRATED` → `ACTIVE` si membresía
  vigente; permanece con `membershipStatus` `DEBT`/`EXPIRED` si corresponde).
- Dispara notificación `ACCOUNT_ACTIVATED`.

Response 201:

```json
{ "memberId": "01J...", "memberStatus": "ACTIVE", "membershipStatus": "ACTIVE" }
```

Errores: 404 `DNI_NOT_FOUND`; 409 `ALREADY_ACTIVATED` / `EMAIL_ALREADY_USED`;
400 `VALIDATION_ERROR`.

### POST /registration

Request:

```json
{
  "dni": "10203040",
  "email": "nuevo@example.com",
  "password": "••••••••",
  "firstName": "Juan",
  "lastName": "Pérez",
  "phone": "999000111"
}
```

- Verifica que el DNI/email no existan (RN-ACT-03). Crea `Member` `origin=NEW`,
  `memberStatus=PENDING` y usuario Cognito (grupo `member`).
- No puede reservar hasta ser aprobado y pagar (RN-ACT-06/07).

Response 201:

```json
{ "memberId": "01J...", "memberStatus": "PENDING" }
```

Errores: 409 `DNI_ALREADY_USED` / `EMAIL_ALREADY_USED`; 400 `VALIDATION_ERROR`.

## 4. Socios (RN-ADM, dashboard)

| Método | Ruta                          | Auth   | Descripción                                        |
| ------ | ----------------------------- | ------ | -------------------------------------------------- |
| GET    | `/members/me`                 | member | Perfil propio + estado de membresía                |
| PATCH  | `/members/me`                 | member | Actualiza datos propios (teléfono)                 |
| PATCH  | `/members/me/auto-renew`      | member | Activa/desactiva renovación automática (RN-PAG-03) |
| GET    | `/members`                    | admin  | Lista socios (filtro por estado)                   |
| GET    | `/members/{memberId}`         | admin  | Detalle de un socio                                |
| POST   | `/members/{memberId}/approve` | admin  | Aprueba socio nuevo (RN-ADM-02)                    |
| POST   | `/members/{memberId}/reject`  | admin  | Rechaza socio nuevo                                |

### GET /members?status=PENDING&cursor=&limit=

Response 200:

```json
{
  "items": [
    {
      "memberId": "01J...",
      "dni": "10203040",
      "firstName": "Juan",
      "lastName": "Pérez",
      "memberStatus": "PENDING",
      "membershipStatus": "NONE",
      "origin": "NEW",
      "createdAt": "..."
    }
  ],
  "nextCursor": null
}
```

### POST /members/{memberId}/approve

- Transiciona `PENDING → APPROVED`. Notificación `MEMBER_APPROVED`. Auditoría
  `MEMBER_APPROVED`. El socio aún debe pagar su primera membresía (RN-ACT-07).

Response 200: `{ "memberId": "...", "memberStatus": "APPROVED" }`.
Errores: 404 `NOT_FOUND`; 409 `CONFLICT` (no estaba en `PENDING`).

### POST /members/{memberId}/reject

Request: `{ "reason": "Datos no verificables" }` → `PENDING → REJECTED`,
notificación `MEMBER_REJECTED`, auditoría.

## 5. Membresías y pagos (RN-PAG)

| Método | Ruta                    | Auth            | Descripción                     |
| ------ | ----------------------- | --------------- | ------------------------------- |
| GET    | `/memberships/plans`    | member          | admin                           | Planes disponibles (mensual/anual)            |
| POST   | `/payments`             | member          | Crea pago Culqi (idempotente)   |
| GET    | `/payments`             | member          | admin                           | Historial: propio (member) o filtrado (admin) |
| GET    | `/payments/{paymentId}` | member          | admin                           | Detalle de pago                               |
| POST   | `/payments/webhook`     | Público (firma) | Confirmación asíncrona de Culqi |

### GET /memberships/plans

Response 200 (valores mock, parametrizables):

```json
{
  "plans": [
    { "type": "MONTHLY", "amount": 12000, "currency": "PEN", "label": "Mensual" },
    {
      "type": "ANNUAL",
      "amount": 120000,
      "currency": "PEN",
      "label": "Anual",
      "allowsInstallments": true
    }
  ]
}
```

### POST /payments

Request:

```json
{
  "membershipType": "ANNUAL",
  "culqiToken": "tkn_test_xxx",
  "idempotencyKey": "9b1f...-uuid",
  "autoRenew": false
}
```

- El backend crea el cargo server-side con la llave privada (nunca en cliente).
  Datos de tarjeta jamás llegan al backend (tokenizados por Culqi.js).
- Idempotencia por `idempotencyKey` (RT-01). La membresía se actualiza **solo**
  al confirmar el resultado de forma segura (RN-PAG-07).

Response 201:

```json
{
  "paymentId": "01J...",
  "paymentStatus": "SUCCEEDED",
  "membershipType": "ANNUAL",
  "amount": 120000,
  "currency": "PEN",
  "membershipEndsAt": "2027-07-09T05:00:00Z"
}
```

Estados posibles de `paymentStatus`: `SUCCEEDED`, `PENDING_CONFIRMATION`,
`FAILED`.
Errores: 402/422 `PAYMENT_FAILED`; 409 `PAYMENT_DUPLICATE` (misma
`idempotencyKey`, devuelve el resultado previo); 400 `VALIDATION_ERROR`.

### POST /payments/webhook

- Ruta **pública** sin Cognito, pero con **verificación de firma** de Culqi
  (RT-14). Confirma cargos de forma idempotente y actualiza membresía. Response 202.

## 6. Recursos y disponibilidad (RN-RES, RN-ADM-04)

| Método | Ruta                                                   | Auth   | Descripción                           |
| ------ | ------------------------------------------------------ | ------ | ------------------------------------- |
| GET    | `/resources`                                           | member | admin                                 | Lista recursos y su estado |
| GET    | `/resources/{resourceId}/availability?date=YYYY-MM-DD` | member | Franjas disponibles del día           |
| PATCH  | `/resources/{resourceId}`                              | admin  | Actualiza aforo/horario/estado        |
| POST   | `/resources/{resourceId}/maintenance`                  | admin  | Bloqueo por mantenimiento (RN-RES-11) |
| DELETE | `/resources/{resourceId}/maintenance/{blockId}`        | admin  | Libera un bloqueo                     |

### GET /resources/{resourceId}/availability?date=2026-07-12

Response 200:

```json
{
  "resourceId": "futbol-1",
  "date": "2026-07-12",
  "blockMinutes": 90,
  "slots": [
    { "startsAt": "2026-07-12T11:00:00Z", "endsAt": "2026-07-12T12:30:00Z", "available": true },
    { "startsAt": "2026-07-12T12:30:00Z", "endsAt": "2026-07-12T14:00:00Z", "available": false }
  ]
}
```

Considera reservas activas (GSI3) y bloqueos de mantenimiento.

### POST /resources/{resourceId}/maintenance

Request: `{ "startsAt": "...", "endsAt": "...", "reason": "Limpieza de piscina" }`
→ 201; notificación `RESOURCE_MAINTENANCE` a socios con reserva en ese recurso;
auditoría `RESOURCE_MAINTENANCE`.

## 7. Reservas (RN-RES)

| Método | Ruta                                    | Auth                               | Descripción                            |
| ------ | --------------------------------------- | ---------------------------------- | -------------------------------------- |
| POST   | `/reservations`                         | member                             | Crea reserva (valida todas las RN-RES) |
| GET    | `/reservations?scope=me                 | all&status=&resourceId=&from=&to=` | member                                 | admin                     | Lista reservas |
| GET    | `/reservations/{reservationId}`         | member                             | admin                                  | Detalle                   |
| POST   | `/reservations/{reservationId}/cancel`  | member                             | admin                                  | Cancela (>24h, RN-RES-10) |
| POST   | `/reservations/{reservationId}/approve` | admin                              | Aprueba parrilla/salón (RN-RES-02)     |
| POST   | `/reservations/{reservationId}/reject`  | admin                              | Rechaza                                |

### POST /reservations

Request:

```json
{
  "resourceId": "parrilla-1",
  "startsAt": "2026-07-20T15:00:00Z",
  "participants": [
    { "type": "MEMBER", "memberId": "01J...socioA" },
    { "type": "GUEST", "dni": "70605040", "name": "Invitado Uno" }
  ],
  "notes": "Cumpleaños"
}
```

El titular es el socio autenticado (se agrega como `HOLDER`, RN-RES-06).
Validaciones server-side (todas obligatorias):

- Socio titular `ACTIVE` y sin deuda (RN-RES-12 / RN-PAG-06) → 422
  `MEMBER_HAS_DEBT` / `MEMBERSHIP_REQUIRED`.
- Dentro del horario del recurso y `endsAt = startsAt + blockMinutes`
  (RN-RES) → 422 `OUTSIDE_SCHEDULE`.
- Sin cruces para el recurso (RN-RES-07) → 409 `RESERVATION_OVERLAP`.
- Sin superposición de ningún participante (RN-RES-08) → 409
  `PARTICIPANT_OVERLAP`.
- Aforo no superado (RN-RES-09) → 422 `CAPACITY_EXCEEDED`.
- Cada invitado externo ≤ 2 visitas/mes (RN-RES-05) → 429 `GUEST_MONTHLY_LIMIT`.
- Recurso no en mantenimiento (RN-RES-11) → 409 `RESOURCE_IN_MAINTENANCE`.

Response 201:

```json
{
  "reservationId": "01J...",
  "resourceId": "parrilla-1",
  "reservationStatus": "PENDING_APPROVAL",
  "startsAt": "2026-07-20T15:00:00Z",
  "endsAt": "2026-07-20T20:00:00Z",
  "participantCount": 3,
  "guestCount": 1
}
```

`reservationStatus`: `CONFIRMED` (fútbol/tenis/pádel/piscina) o
`PENDING_APPROVAL` (parrilla/salón). Notificación `RESERVATION_CONFIRMED` cuando
aplica.

### POST /reservations/{reservationId}/cancel

- Socio: solo su propia reserva y hasta **24h** antes (RN-RES-10) → 422
  `CANCELLATION_TOO_LATE`. Admin: sin restricción de 24h.
- Decrementa contadores de invitado del mes. Estado → `CANCELLED`. Notificación
  `RESERVATION_CANCELLED`.

Response 200: `{ "reservationId": "...", "reservationStatus": "CANCELLED" }`.

### POST /reservations/{reservationId}/approve | reject

- Solo reservas `PENDING_APPROVAL` (RN-RES-02) → 409 `RESERVATION_NOT_PENDING`.
- `approve` → `APPROVED` + `RESERVATION_APPROVED`; `reject` con `{ "reason": "..." }`
  → `REJECTED` + `RESERVATION_REJECTED`. Ambas se auditan.

## 8. Notificaciones (RN-NOT)

| Método | Ruta                                   | Auth   | Descripción                         |
| ------ | -------------------------------------- | ------ | ----------------------------------- |
| GET    | `/notifications`                       | member | Inbox del socio                     |
| POST   | `/notifications/{notificationId}/read` | member | Marca como leída                    |
| POST   | `/notifications`                       | admin  | Publica notificación segmentada     |
| GET    | `/notifications/sent`                  | admin  | Notificaciones enviadas (analytics) |

### GET /notifications

Response 200:

```json
{
  "items": [
    {
      "notificationId": "01J...",
      "title": "Pago confirmado",
      "body": "...",
      "event": "PAYMENT_SUCCEEDED",
      "readStatus": "UNREAD",
      "createdAt": "..."
    }
  ],
  "nextCursor": null
}
```

### POST /notifications (admin)

Request:

```json
{
  "segment": "DEBT",
  "title": "Regulariza tu membresía",
  "body": "Tienes un saldo pendiente...",
  "alsoEmail": true
}
```

`segment`: `ALL`|`ACTIVE`|`DEBT`|`EXPIRED`|`EXPIRING_SOON`|`SINGLE`|`BY_RESOURCE`.
Para `SINGLE` requiere `targetMemberId`; para `BY_RESOURCE` requiere
`resourceId` (RN-NOT-03). Crea `Notification` + `MemberNotification` por
destinatario; correo SES si `alsoEmail`. Auditoría `NOTIFICATION_SENT`.

Response 201: `{ "notificationId": "...", "recipientCount": 34 }`.

## 9. Dashboards (RN-ANL, dashboard del socio)

| Método | Ruta                | Auth   | Descripción                      |
| ------ | ------------------- | ------ | -------------------------------- |
| GET    | `/dashboard/member` | member | Home personal del socio          |
| GET    | `/dashboard/admin`  | admin  | Métricas administrativas del MVP |

### GET /dashboard/member

Response 200:

```json
{
  "member": { "firstName": "María", "memberStatus": "ACTIVE" },
  "membership": {
    "type": "ANNUAL",
    "status": "EXPIRING_SOON",
    "endsAt": "2026-07-15T05:00:00Z",
    "daysRemaining": 6,
    "outstandingBalance": 0
  },
  "canReserve": true,
  "alerts": [{ "code": "RENEWAL_DUE", "message": "Tu membresía vence pronto." }],
  "upcomingReservations": [
    {
      "reservationId": "01J...",
      "resourceType": "FUTBOL",
      "startsAt": "...",
      "reservationStatus": "CONFIRMED"
    }
  ],
  "recentNotifications": [{ "notificationId": "01J...", "title": "...", "readStatus": "UNREAD" }]
}
```

`canReserve` refleja RN-PAG-06/RN-RES-12 (activo y sin deuda).

### GET /dashboard/admin

Response 200 (cubre RN-ANL-01..08):

```json
{
  "membersByStatus": { "MIGRATED": 40, "PENDING": 3, "ACTIVE": 70, "REJECTED": 1 },
  "membershipsExpiringSoon": 8,
  "reservationsByResource": { "futbol-1": 12, "piscina-1": 20 },
  "reservationsByDay": [{ "date": "2026-07-12", "count": 9 }],
  "pendingApprovals": 4,
  "payments": { "succeeded": 55, "failed": 3 },
  "occupancy": [{ "resourceId": "futbol-1", "occupancyRate": 0.62 }],
  "notificationsSent": 14
}
```

## 10. Administración operativa

| Método | Ruta                   | Auth  | Descripción                              |
| ------ | ---------------------- | ----- | ---------------------------------------- |
| POST   | `/admin/migration/run` | admin | Ejecuta la migración desde el JSON en S3 |

Response 202: contrato de salida de migración (ver
[mapeo-migracion.md](../data/mapeo-migracion.md) §6). Auditoría `MIGRATION_RUN`.

## 11. Trazabilidad endpoint ↔ regla

| Flujo               | Endpoints                                              | Reglas                   |
| ------------------- | ------------------------------------------------------ | ------------------------ |
| Activación          | `/activation/*`                                        | RN-ACT-01/02/03/07       |
| Registro/aprobación | `/registration`, `/members/{id}/approve                | reject`                  | RN-ACT-05/06, RN-ADM-02 |
| Pagos               | `/payments`, `/payments/webhook`, `/memberships/plans` | RN-PAG-01..08            |
| Reservas            | `/reservations*`, `/resources/*/availability`          | RN-RES-01..12            |
| Mantenimiento       | `/resources/{id}/maintenance`                          | RN-RES-11, RN-ADM-04     |
| Notificaciones      | `/notifications*`                                      | RN-NOT-01..04, RN-ADM-06 |
| Dashboards          | `/dashboard/*`                                         | RN-ANL-01..08            |
| Migración           | `/admin/migration/run`                                 | RN-MIG-01..06            |
