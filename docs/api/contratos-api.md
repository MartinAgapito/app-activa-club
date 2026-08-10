# Contratos de API — Activa Club

> Contratos REST iniciales del MVP. Definición, no implementación. Alineados con
> el [modelo de datos](../data/modelo-dynamodb.md), las
> [reglas de negocio](../product/reglas-de-negocio.md) y los tipos de
> `packages/shared-types` / esquemas de `packages/validation`. Estilo REST sobre
> API Gateway + Lambda por endpoint
> ([ADR-0004](../architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md)).

## 1. Convenciones generales

- **Base URL**: `https://<dominio-cloudfront>/api` (prefijo `/api`). Es el
  mismo dominio que sirve el SPA (`apps/web`), no el dominio
  `execute-api.amazonaws.com` directo: CloudFront rutea `/api/*` al API
  Gateway del entorno como un `cache_behavior` adicional sobre el mismo
  origen, así el navegador nunca hace preflight `OPTIONS` de CORS (fix
  P0-1). Versionado futuro por path.
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

| Método | Ruta                          | Auth            | Descripción                                                 |
| ------ | ----------------------------- | --------------- | ----------------------------------------------------------- |
| GET    | `/members/me`                 | member          | Perfil propio + estado de membresía                         |
| PATCH  | `/members/me`                 | member          | Actualiza datos propios (teléfono)                          |
| PATCH  | `/members/me/auto-renew`      | member          | Activa/desactiva renovación automática (RN-PAG-03)          |
| GET    | `/members/lookup?dni=`        | member \| admin | Resuelve un socio por DNI exacto (participantes, RN-RES-03) |
| GET    | `/members`                    | admin           | Lista socios (filtro por estado)                            |
| GET    | `/members/{memberId}`         | admin           | Detalle de un socio                                         |
| POST   | `/members/{memberId}/approve` | admin           | Aprueba socio nuevo (RN-ADM-02)                             |
| POST   | `/members/{memberId}/reject`  | admin           | Rechaza socio nuevo                                         |

### PATCH /members/me/auto-renew

Activa o desactiva la renovación automática del socio autenticado (US-023,
RN-PAG-03; tipo `AutoRenewRequest` de `packages/shared-types`, ya definido
desde Sprint 0). Deliberadamente **desactivada por defecto**: ninguna
cuenta queda con `autoRenew=true` sin esta acción explícita. La identidad
sale siempre del JWT — no hay `memberId` en la ruta ni en el body, así que
no existe forma de modificar la preferencia de otro socio.

Request:

```json
{ "enabled": true }
```

Response 200: el `Member` actualizado (mismo shape que `GET /members/me`,
incluido su campo `autoRenew`).

Errores: 400 `VALIDATION_ERROR` (falta `enabled` o no es booleano); 422
`MEMBER_NOT_APPROVED` (socio `PENDING`/`REJECTED`).

Fuera de alcance: activar esta preferencia **no** dispara ningún cobro
automático desatendido — esa ejecución no existe todavía (ver "Alcance de la
renovación automática" en
[US-023](../scrum/historias/US-023-renovacion-membresia-autorenovacion.md)).
`autoRenew` también puede activarse junto con un pago exitoso vía
`POST /payments` (§5, campo `autoRenew` del request — ahí sí se llama
`autoRenew`, no `enabled`: son dos contratos distintos, no lo mismo).

### GET /members/lookup?dni=45678912

Resuelve **un** socio por su DNI exacto para poder agregarlo como participante
de una reserva (RN-RES-03, US-031). Es el único endpoint del rol `member` que
devuelve datos de otro socio, y por eso está deliberadamente acotado
([ADR-0009](../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)):

- **Coincidencia exacta** del DNI (8 dígitos, `dniSchema`). No admite búsqueda
  parcial, por nombre ni listado: devuelve cero o un resultado, sin paginación.
- **Respuesta mínima**: solo lo necesario para armar la reserva (`memberId`) y
  para que el titular confirme a quién agrega (`firstName`, `lastName`). Nunca
  correo, teléfono, DNI, `memberStatus`, `membershipStatus`,
  `outstandingBalance` ni ningún otro campo del socio (criterio 13 de US-031).

Request: `GET /api/members/lookup?dni=45678912`

Response 200:

```json
{ "memberId": "01J...", "firstName": "María", "lastName": "Quispe" }
```

Errores: 400 `VALIDATION_ERROR` (falta `dni` o no cumple el formato); 401
`UNAUTHENTICATED`; 404 `DNI_NOT_FOUND`.

Se responde **404 `DNI_NOT_FOUND`** tanto si no existe ningún socio con ese DNI
como si el socio existe pero su `memberStatus` es `PENDING` o `REJECTED`: una
solicitud de alta todavía no aprobada (o rechazada) no es un socio del club
(RN-ACT-06/07) y este endpoint tampoco debe servir para averiguar el estado de
la solicitud de un tercero. Sí son resolubles los socios `MIGRATED`, `APPROVED`
y `ACTIVE`: la exigencia de estar activo y sin deuda (RN-RES-12) recae en el
**titular** de la reserva, no en sus acompañantes, así que un socio al día no
queda bloqueado por la situación de membresía de quien lo acompaña.

**Por qué un endpoint propio y no `GET /members?dni=`**: `GET /members` es un
listado paginado por `memberStatus` exclusivo de `admin` que devuelve DNI,
estado de membresía y origen de todos los socios. Sobrecargarlo con una forma
de respuesta distinta según el rol del llamador haría que un fallo en la
comprobación de rol expusiera el padrón completo, y obligaría a una sola Lambda
a tener a la vez permiso de `Query` sobre GSI2 y de lectura puntual. Separados,
la superficie del rol `member` es una Lambda que solo hace `GetItem` por DNI y
devuelve tres campos.

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

| Método | Ruta                    | Auth            | Descripción                                   |
| ------ | ----------------------- | --------------- | --------------------------------------------- |
| GET    | `/memberships/plans`    | member \| admin | Planes disponibles (mensual/anual)            |
| POST   | `/payments`             | member          | Crea pago Stripe (idempotente)                |
| GET    | `/payments`             | member \| admin | Historial: propio (member) o filtrado (admin) |
| GET    | `/payments/{paymentId}` | member \| admin | Detalle de pago                               |
| POST   | `/payments/webhook`     | Público (firma) | Confirmación asíncrona de Stripe              |

> **Pasarela de pagos: Stripe (test mode)** — [ADR-0011](../architecture/adr/ADR-0011-stripe-sandbox-reemplaza-culqi.md)
> reemplaza a [ADR-0007](../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).
> El flujo es **Stripe.js/Elements en el cliente + PaymentIntents en el
> servidor**. Rutas, verbos, códigos de error y semántica **no cambian**; sí
> cambian los nombres de los campos propios del proveedor
> (`culqiToken` → `stripePaymentMethodId`, `culqiChargeId` →
> `stripePaymentIntentId`). El renombrado en el código es
> [US-037](../scrum/historias/US-037-migrar-pasarela-culqi-a-stripe.md).

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
  "stripePaymentMethodId": "pm_1P...",
  "idempotencyKey": "9b1f...-uuid",
  "autoRenew": false
}
```

| Campo                   | Tipo                  | Obligatorio | Descripción                                                                                            |
| ----------------------- | --------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `membershipType`        | `MONTHLY` \| `ANNUAL` | Sí          | Plan a cobrar. El **monto y la moneda los resuelve el backend**, nunca el cliente.                     |
| `stripePaymentMethodId` | string `pm_...`       | Sí          | Identificador de método de pago creado por Stripe.js en el cliente. Reemplaza al antiguo `culqiToken`. |
| `idempotencyKey`        | string (8–128)        | Sí          | Generada una vez por intento de compra y reutilizada en los reintentos del mismo intento.              |
| `autoRenew`             | boolean               | No          | Solicitud de renovación automática (US-023).                                                           |

- El esquema es **estricto**: cualquier campo no declarado (p. ej. `cardNumber`,
  `cvv`, `expirationDate`) devuelve 400 `VALIDATION_ERROR` en vez de
  descartarse en silencio (US-026, criterio 1).
- El backend crea el **PaymentIntent** server-side con la llave secreta
  (`sk_test_`, leída de SSM; nunca en el cliente ni en el repo). Los datos de
  tarjeta jamás llegan al backend: viven dentro de los iframes de Stripe
  Elements (RN-PAG-08).
- **Doble idempotencia** (ADR-0011 §D4): la misma `idempotencyKey` se envía
  como header `Idempotency-Key` **nativo de Stripe** (evita el doble cargo del
  lado del proveedor) y además se reserva como ítem `PaymentIdempotency` en
  DynamoDB con `attribute_not_exists` (evita duplicar `Payment`/
  `MembershipPeriod` del lado del dominio, y permite responder
  `PAYMENT_DUPLICATE` sin llamar a Stripe). RT-01.
- La membresía se actualiza **solo** al confirmar el resultado de forma segura
  (RN-PAG-07).

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
`idempotencyKey`, devuelve el resultado previo); 400 `VALIDATION_ERROR`;
422 `MEMBER_NOT_APPROVED` (socio `PENDING`/`REJECTED`).

**Mapeo del resultado de Stripe a `paymentStatus`** (ADR-0011 §D5; el cliente
no ve estados de Stripe, solo estos tres):

| Resultado del PaymentIntent                                                  | `paymentStatus`        | HTTP                     |
| ---------------------------------------------------------------------------- | ---------------------- | ------------------------ |
| `succeeded`                                                                  | `SUCCEEDED`            | 201                      |
| `processing`, `requires_action`, `requires_confirmation`, `requires_capture` | `PENDING_CONFIRMATION` | 201                      |
| `requires_payment_method`, `canceled`, o `StripeCardError` (rechazo)         | `FAILED`               | 402/422 `PAYMENT_FAILED` |
| Error de red / timeout / respuesta perdida                                   | `PENDING_CONFIRMATION` | 201                      |

`PENDING_CONFIRMATION` se resuelve por el webhook (`POST /payments/webhook`).
El MVP **no** implementa el desafío 3DS/SCA: el PaymentIntent se crea con
`automatic_payment_methods.allow_redirects = 'never'`, y un eventual
`requires_action` se trata como pendiente, no como éxito.

### GET /payments?memberId=&status=&cursor=&limit= (US-025)

- `member`: siempre su propio historial, más reciente primero; el `memberId`
  de la query se ignora por completo (el backend lo resuelve desde el JWT,
  nunca desde el input del cliente — criterio 4). Admite `status` como filtro
  adicional sobre su propio historial.
- `admin`: filtra por `memberId` y/o `status`; requiere al menos uno de los
  dos (mismo criterio ya aplicado en `GET /members`: el modelo de `Payment`
  solo define patrones de acceso por socio o por estado, nunca "todos los
  pagos sin filtro", para evitar un `Scan` completo de la tabla) — sin
  ninguno de los dos, 400 `VALIDATION_ERROR`.

Response 200:

```json
{
  "items": [
    {
      "paymentId": "01J...",
      "memberId": "01J...",
      "membershipType": "ANNUAL",
      "amount": 120000,
      "currency": "PEN",
      "paymentStatus": "SUCCEEDED",
      "stripePaymentIntentId": "pi_3P...",
      "createdAt": "2026-07-09T05:00:00Z",
      "confirmedAt": "2026-07-09T05:00:05Z"
    }
  ],
  "nextCursor": null
}
```

Nunca incluye `idempotencyKey` ni `failureReason` (campos internos de
orquestación); el único identificador externo es `stripePaymentIntentId`
(criterio 7, RN-PAG-08). Tampoco se exponen ni se persisten el
`stripePaymentMethodId`, el `client_secret`, los últimos 4 dígitos ni la marca
de la tarjeta.

### GET /payments/{paymentId} (US-025)

- `member`: solo el detalle de un pago propio; uno ajeno o inexistente
  responde 404 `NOT_FOUND` (se eligió 404 antes que 403 para no confirmar a
  un socio la existencia de un `paymentId` ajeno).
- `admin`: el detalle de cualquier pago; inexistente → 404 `NOT_FOUND`.

Response 200: mismo shape que un elemento de `items` en `GET /payments`.

### POST /payments/webhook

- Ruta **pública** sin Cognito, pero con **verificación de firma** de Stripe
  (RT-14). Confirma pagos de forma idempotente y actualiza membresía
  (ADR-0011, US-024, US-037).
- **Firma**: header **`Stripe-Signature`**, con el esquema
  `t=<timestamp>,v1=<hmac-sha256>` de Stripe. Se verifica con
  `stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSigningSecret)`
  del SDK oficial —**no** con una implementación manual de HMAC—, porque el
  esquema incluye tolerancia de timestamp (anti-replay) y comparación en tiempo
  constante. El secreto de firma (`whsec_...`) se lee de
  `STRIPE_WEBHOOK_SECRET_PARAM_NAME`, **distinto** de la llave secreta de cobro
  (`STRIPE_SECRET_KEY_PARAM_NAME`).
- **Cuerpo crudo obligatorio**: la firma se calcula sobre los bytes exactos del
  cuerpo. En API Gateway REST + Lambda se debe usar `event.body` sin parsear y
  decodificarlo si `event.isBase64Encoded` es `true`. Parsear a JSON y volver a
  serializar invalida la firma.
- Firma inválida, ausente o fuera de tolerancia → 401 `UNAUTHENTICATED`, sin
  ningún efecto, registrada como intento sospechoso.
- **Cuerpo** (evento de Stripe; solo se leen los campos listados):

  ```json
  {
    "id": "evt_3P...",
    "type": "payment_intent.succeeded",
    "data": {
      "object": {
        "id": "pi_3P...",
        "status": "succeeded",
        "amount": 120000,
        "currency": "pen",
        "metadata": { "paymentId": "01J..." },
        "last_payment_error": { "code": "card_declined", "decline_code": "generic_decline" }
      }
    }
  }
  ```

  | Campo                            | Uso                                                                                                                                                                                            |
  | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `type`                           | `payment_intent.succeeded` → `SUCCEEDED`; `payment_intent.payment_failed` → `FAILED`. Cualquier otro tipo se responde 202 sin efectos.                                                         |
  | `data.object.id`                 | Se persiste como `stripePaymentIntentId`.                                                                                                                                                      |
  | `data.object.metadata.paymentId` | **Único correlacionador** con el `paymentId` propio (enviado como `metadata.paymentId` al crear el PaymentIntent, ADR-0011 §D3).                                                               |
  | `data.object.last_payment_error` | Solo en `payment_intent.payment_failed`. Se usa `code`/`decline_code` para mapear un `failureReason` del **catálogo propio**; nunca se persiste ni se registra el mensaje crudo del proveedor. |

  El evento nunca contiene PAN, CVC ni secretos (RN-PAG-08).

- Response 202 siempre que la firma sea válida, sin importar el desenlace de
  negocio (pago confirmado, ya resuelto, fallo registrado o `paymentId` no
  reconocido): evita que el emisor distinga por el código HTTP si un pago
  existe en este sistema.
- El procesamiento es **idempotente**: recibir N veces el mismo evento produce
  el mismo estado final que recibirlo una vez, y converge con la ruta síncrona
  de `POST /payments` sin importar cuál llegue primero.

## 6. Recursos y disponibilidad (RN-RES, RN-ADM-04)

| Método | Ruta                                                   | Auth   | Descripción                           |
| ------ | ------------------------------------------------------ | ------ | ------------------------------------- |
| GET    | `/resources`                                           | member | admin                                 | Lista recursos y su estado |
| GET    | `/resources/{resourceId}/availability?date=YYYY-MM-DD` | member | Franjas disponibles del día           |
| PATCH  | `/resources/{resourceId}`                              | admin  | Actualiza aforo/horario/estado        |
| POST   | `/resources/{resourceId}/maintenance`                  | admin  | Bloqueo por mantenimiento (RN-RES-11) |
| DELETE | `/resources/{resourceId}/maintenance/{blockId}`        | admin  | Libera un bloqueo                     |

### GET /resources

Devuelve el catálogo completo de instalaciones (los diez recursos del club) con
todos los campos del tipo `Resource`. Un recurso en mantenimiento **sigue
apareciendo** en la lista, marcado con `resourceStatus=MAINTENANCE`.

El catálogo se carga como **dato de infraestructura versionado en Terraform**
(un `aws_dynamodb_table_item` por recurso,
[ADR-0010](../architecture/adr/ADR-0010-catalogo-recursos-como-datos-de-infraestructura.md));
no existe ni existirá un endpoint de alta de recursos. Reparto de propiedad de
los campos, para que no haya duda de quién manda sobre cada uno:

| Campos                                                           | Fuente de verdad  | Cómo se cambian                   |
| ---------------------------------------------------------------- | ----------------- | --------------------------------- |
| `resourceId`, `type`, `name`, `blockMinutes`, `requiresApproval` | Terraform         | PR + `apply` (reemplazo del ítem) |
| `capacity`, `opensAt`, `closesAt`, `resourceStatus`              | Runtime (`admin`) | `PATCH /resources/{resourceId}`   |

Terraform fija el valor **inicial** de los cuatro campos de runtime y no los
vuelve a tocar: una edición del administrador sobrevive a los despliegues.

### GET /resources/{resourceId}/availability?date=2026-07-12

Response 200:

```json
{
  "resourceId": "futbol-1",
  "date": "2026-07-12",
  "blockMinutes": 90,
  "resourceStatus": "AVAILABLE",
  "slots": [
    {
      "startsAt": "2026-07-12T11:00:00Z",
      "endsAt": "2026-07-12T12:30:00Z",
      "available": true,
      "status": "AVAILABLE"
    },
    {
      "startsAt": "2026-07-12T12:30:00Z",
      "endsAt": "2026-07-12T14:00:00Z",
      "available": false,
      "status": "RESERVED"
    },
    {
      "startsAt": "2026-07-12T14:00:00Z",
      "endsAt": "2026-07-12T15:30:00Z",
      "available": false,
      "status": "MAINTENANCE"
    }
  ]
}
```

Considera reservas activas (GSI3) y bloqueos de mantenimiento.

`status` de cada franja (`AvailabilitySlotStatus`) explica **por qué** no se
puede reservar, para que el socio distinga una franja tomada por otra reserva de
una franja fuera de servicio (RN-RES-11):

| `status`      | Significado                                                                     |
| ------------- | ------------------------------------------------------------------------------- |
| `AVAILABLE`   | Franja libre y reservable. Equivale a `available: true`.                        |
| `RESERVED`    | Ocupada por una reserva activa (`CONFIRMED`, `PENDING_APPROVAL` o `APPROVED`).  |
| `MAINTENANCE` | Solapada por un `MaintenanceBlock`, o recurso con `resourceStatus=MAINTENANCE`. |
| `PAST`        | Franja cuyo inicio ya pasó respecto del momento de la consulta.                 |

Reglas de resolución:

- `available` se mantiene y es exactamente `status === "AVAILABLE"`. Ningún
  cliente debe derivar la reservabilidad de `status`: `available` sigue siendo
  el campo de decisión.
- Cuando aplica más de un motivo, la precedencia es **`PAST` → `MAINTENANCE` →
  `RESERVED`**: una franja del pasado se informa como pasada aunque además esté
  bloqueada, y el mantenimiento manda sobre la ocupación por reserva (las
  reservas ya creadas en una franja bloqueada **no** se cancelan
  automáticamente, ver US-035).
- `resourceStatus` a nivel de respuesta permite a la interfaz distinguir un
  **bloqueo indefinido** del recurso (`MAINTENANCE`, puesto con
  `PATCH /resources/{resourceId}`, que devuelve todas las franjas del día con
  `status=MAINTENANCE`) de una **ventana acotada** de mantenimiento (que solo
  afecta a las franjas solapadas).
- El motivo del bloqueo (`reason`) **no** se expone en esta respuesta: es una
  nota operativa del administrador. El socio ve que la franja está en
  mantenimiento, no por qué.

### POST /resources/{resourceId}/maintenance

Request: `{ "startsAt": "...", "endsAt": "...", "reason": "Limpieza de piscina" }`
→ 201; notificación `RESOURCE_MAINTENANCE` a socios con reserva en ese recurso;
auditoría `RESOURCE_MAINTENANCE`.

El bloqueo **impide reservas nuevas** en la franja (409
`RESOURCE_IN_MAINTENANCE`) y hace que esas franjas se devuelvan con
`status=MAINTENANCE`, pero **no cancela** las reservas ya existentes: el
administrador decide caso por caso y puede cancelarlas sin la restricción de
24 h (RN-RES-10, US-035/US-036). Por eso la respuesta 201 incluye
`affectedReservationCount`, el número de reservas activas que quedan dentro de
la ventana bloqueada:

```json
{
  "blockId": "01J...",
  "resourceId": "piscina-1",
  "startsAt": "2026-07-20T13:00:00Z",
  "endsAt": "2026-07-20T18:00:00Z",
  "reason": "Limpieza de piscina",
  "affectedReservationCount": 2
}
```

## 7. Reservas (RN-RES)

| Método | Ruta                                    | Auth                               | Descripción                                               |
| ------ | --------------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| POST   | `/reservations`                         | member                             | Crea reserva (valida todas las RN-RES)                    |
| GET    | `/reservations?scope=me                 | all&status=&resourceId=&from=&to=` | member                                                    | admin                     | Lista reservas |
| GET    | `/reservations/{reservationId}`         | member                             | admin                                                     | Detalle                   |
| POST   | `/reservations/{reservationId}/cancel`  | member                             | admin                                                     | Cancela (>24h, RN-RES-10) |
| POST   | `/reservations/{reservationId}/approve` | admin                              | Aprueba parrilla/salón (RN-RES-02)                        |
| POST   | `/reservations/{reservationId}/reject`  | admin                              | Rechaza                                                   |
| GET    | `/guests/lookup?dni=`                   | member \| admin                    | Resuelve un invitado externo ya registrado (RN-RES-03/04) |

### GET /guests/lookup?dni=70605040

Resuelve el **perfil de un invitado externo** por su DNI exacto, para que el
socio titular reutilice a un invitado de reservas anteriores sin volver a
escribir su nombre (entidad `GuestProfile`, modelo de datos §3.15;
[ADR-0009](../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)).

Response 200:

```json
{ "guestDni": "70605040", "firstName": "Ana", "lastName": "Torres" }
```

Errores: 400 `VALIDATION_ERROR` (DNI ausente o con formato inválido); 401
`UNAUTHENTICATED`; **404 `NOT_FOUND`** cuando ese DNI todavía no fue invitado
nunca — no es un error de negocio: es la señal de que la interfaz debe pedir
nombre y apellido para darlo de alta al confirmar la reserva.

Mismo criterio de privacidad que `GET /members/lookup`: solo nombre y apellido.
En particular **no** se expone el contador mensual del invitado
(`GuestMonthlyCounter`, cuántas visitas lleva o le quedan): revelaría que esa
persona estuvo en el club invitada por otro socio. El tope de dos visitas se
sigue haciendo valer en el servidor al crear la reserva (429
`GUEST_MONTHLY_LIMIT`, RN-RES-05).

### POST /reservations

Request:

```json
{
  "resourceId": "parrilla-1",
  "startsAt": "2026-07-20T15:00:00Z",
  "participants": [
    { "type": "MEMBER", "memberId": "01J...socioA" },
    { "type": "GUEST", "dni": "70605040", "firstName": "Ana", "lastName": "Torres" }
  ],
  "notes": "Cumpleaños"
}
```

El titular es el socio autenticado (se agrega como `HOLDER`, RN-RES-06).

**Participantes de tipo `MEMBER`**: requieren `memberId`, que el titular obtiene
con `GET /members/lookup?dni=` (§4). Un `memberId` que no corresponde a un socio
resoluble se rechaza con 404 `NOT_FOUND` sin crear nada.

**Participantes de tipo `GUEST`**: requieren `dni`, `firstName` y `lastName`
(sustituyen al antiguo campo único `name`, para alinearlos con `Member` y con la
entidad `GuestProfile`). El alta del invitado es **implícita e idempotente**
dentro de la misma transacción que crea la reserva:

- Si el DNI no tenía perfil, se crea con el nombre y apellido enviados.
- Si ya tenía perfil, **se conserva el nombre existente** (gana el primer
  registro) y el nombre enviado se ignora sin error: un error de tipeo de otro
  socio no puede bloquear una reserva legítima ni renombrar a un invitado ajeno.
  Por eso el `guestName` que queda en cada `ReservationParticipant` es copia del
  perfil resuelto, no del texto de la petición, y todas las reservas del mismo
  DNI muestran el mismo nombre.
- Si cualquier regla falla (aforo, cupo mensual, solape, mantenimiento), la
  transacción no deja ni reserva, ni participantes, ni perfil, ni contadores.

`participants` admite como máximo 30 elementos (aforo mayor del catálogo, el
salón social), lo que mantiene la transacción de creación por debajo del límite
de 100 ítems de `TransactWriteItems` en el peor caso (cabecera + participantes +
contadores mensuales + perfiles de invitado).
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
| Participantes       | `/members/lookup`, `/guests/lookup`                    | RN-RES-03/04             |
| Mantenimiento       | `/resources/{id}/maintenance`                          | RN-RES-11, RN-ADM-04     |
| Notificaciones      | `/notifications*`                                      | RN-NOT-01..04, RN-ADM-06 |
| Dashboards          | `/dashboard/*`                                         | RN-ANL-01..08            |
| Migración           | `/admin/migration/run`                                 | RN-MIG-01..06            |
