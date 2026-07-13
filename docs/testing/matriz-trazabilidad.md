# Matriz de trazabilidad de pruebas — Activa Club

> Entregable de [US-006](../scrum/historias/US-006-estrategia-matriz-pruebas.md) (Sprint 0, QA).
> Complementa la [estrategia de pruebas](./estrategia-de-pruebas.md). Cruza
> historia/épica → regla(s) de negocio (`RN-*`) → caso de prueba → endpoint del
> [contrato API](../api/contratos-api.md) → tipo de prueba → severidad si falla
> → estado.

## Cómo leer esta matriz

- **Historia/Épica**: historia de Sprint 0 que fundamenta el caso (`US-001`,
  `US-003`) o épica funcional futura donde se implementará y ejecutará el caso
  (`EP-02`..`EP-08`, ver [EP-01](../scrum/epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md#épicas-funcionales-siguientes-referencia-no-parte-de-ep-01)).
  Los IDs `US-*` concretos de Sprint 1 aún no existen (se definirán en el
  Sprint Planning de cada épica funcional); esta columna se actualizará con el
  ID definitivo en cuanto se cree la historia correspondiente.
- **Regla(s)**: referencia a [reglas-de-negocio.md](../product/reglas-de-negocio.md).
- **Endpoint(s)**: referencia a [contratos-api.md](../api/contratos-api.md).
- **Tipo de prueba**: Unitaria (U), Integración de API (IA), Integración de
  componente/RTL (IC), E2E (E2E), Manual documentada (M), Seguridad (SEC).
- **Severidad si falla**: bloqueante | alta | media | baja (definiciones en
  [estrategia-de-pruebas.md §8.1](./estrategia-de-pruebas.md#81-severidades)).
- **Estado**: en Sprint 0 todos los casos están **pendiente** (no hay
  implementación funcional; ver restricción del [Sprint 0](../scrum/sprints/sprint-0.md)).
  Estados futuros: `pendiente` → `en progreso` → `pasa` / `falla` (con defecto
  vinculado) → `aprobado`.

## 1. Migración (RN-MIG) — épica futura EP-02

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| M-01 | La migración carga socios, membresías, saldo pendiente resumido y estado legado desde el JSON mock hacia DynamoDB | RN-MIG-01/02/03/06 | `POST /admin/migration/run` | IA | Bloqueante | Pendiente |
| M-02 | La migración NO trae pagos históricos detallados ni reservas históricas | RN-MIG-04 | `POST /admin/migration/run` | IA | Alta | Pendiente |
| M-03 | Cada socio migrado conserva su `legacyId` para trazabilidad | RN-MIG-05 | `POST /admin/migration/run` | U + IA | Media | Pendiente |
| M-04 | Tras migrar, las lecturas de socio provienen de DynamoDB, no del JSON origen | RN-MIG-06 | `GET /members/{memberId}` | IA | Alta | Pendiente |
| M-05 | Reintentar la migración no duplica socios (idempotencia de la carga) | RN-MIG-02/03 | `POST /admin/migration/run` | IA | Alta | Pendiente |

## 2. Activación y registro (RN-ACT) — épica futura EP-03

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| A-01 | DNI válido de socio migrado y no activado → elegible para activar | RN-ACT-01/02 | `POST /activation/verify` | U + IA | Bloqueante | Pendiente |
| A-02 | DNI inválido (formato) o inexistente → `404 DNI_NOT_FOUND` | RN-ACT-01/02 | `POST /activation/verify` | IA | Alta | Pendiente |
| A-03 | DNI ya activado (tiene cuenta digital) → `409 ALREADY_ACTIVATED` | RN-ACT-02/03 | `POST /activation/verify`, `POST /activation/complete` | IA | Bloqueante | Pendiente |
| A-04 | Completar activación con DNI elegible crea cuenta Cognito, enlaza `cognitoSub` y transiciona `memberStatus` según membresía vigente | RN-ACT-01, RN-PAG-06 | `POST /activation/complete` | IA + E2E | Bloqueante | Pendiente |
| A-05 | Un DNI ya usado por otra cuenta no puede reactivarse ni asociarse dos veces (unicidad transaccional `UniqueDni`) | RN-ACT-03 | `POST /activation/complete` | IA | Bloqueante | Pendiente |
| A-06 | Email ya usado por otra cuenta → `409 EMAIL_ALREADY_USED` | RN-ACT-03 (extendida a email) | `POST /activation/complete`, `POST /registration` | IA | Alta | Pendiente |
| A-07 | Activación exitosa dispara notificación `ACCOUNT_ACTIVATED` | RN-NOT-04 | `POST /activation/complete` | IA | Media | Pendiente |
| A-08 | Login con correo y contraseña tras activación (Cognito nativo) | RN-ACT-04 | `InitiateAuth` (Cognito, fuera de API propia) | E2E | Bloqueante | Pendiente |
| A-09 | Persona no migrada se registra como socio nuevo → `memberStatus=PENDING` | RN-ACT-05 | `POST /registration` | IA + E2E | Alta | Pendiente |
| A-10 | Registro con DNI o email ya existentes → `409 DNI_ALREADY_USED` / `EMAIL_ALREADY_USED` | RN-ACT-05 | `POST /registration` | IA | Alta | Pendiente |
| A-11 | Socio nuevo pendiente no puede reservar hasta ser aprobado | RN-ACT-06 | `POST /reservations` | IA | Bloqueante | Pendiente |
| A-12 | Admin aprueba socio nuevo (`PENDING → APPROVED`), dispara `MEMBER_APPROVED` y auditoría | RN-ACT-06, RN-ADM-02 | `POST /members/{memberId}/approve` | IA + E2E | Alta | Pendiente |
| A-13 | Admin rechaza socio nuevo con motivo (`PENDING → REJECTED`), dispara `MEMBER_REJECTED` y auditoría | RN-ACT-06, RN-ADM-02 | `POST /members/{memberId}/reject` | IA | Media | Pendiente |
| A-14 | Aprobar/rechazar un socio que no está en `PENDING` → `409 CONFLICT` | RN-ACT-06 | `POST /members/{memberId}/approve\|reject` | IA | Media | Pendiente |
| A-15 | Socio aprobado debe pagar la primera membresía para quedar `ACTIVE` y poder reservar | RN-ACT-07 | `POST /payments`, `POST /reservations` | IA + E2E | Bloqueante | Pendiente |

## 3. Membresías y pagos (RN-PAG) — épica futura EP-04

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| P-01 | Planes mensual y anual disponibles con montos correctos | RN-PAG-01 | `GET /memberships/plans` | IA | Baja | Pendiente |
| P-02 | Pago exitoso con tarjeta de prueba Culqi sandbox actualiza membresía a `ACTIVE`/`membershipEndsAt` correcto | RN-PAG-04/07 | `POST /payments` | IA + E2E | Bloqueante | Pendiente |
| P-03 | Pago fallido (tarjeta de prueba de rechazo) → `paymentStatus=FAILED`, membresía no se activa | RN-PAG-04/07 | `POST /payments` (`PAYMENT_FAILED`) | IA | Alta | Pendiente |
| P-04 | Pago duplicado con la misma `idempotencyKey` no genera doble cargo; devuelve el resultado previo | RN-PAG-07 (ADR-0007) | `POST /payments` (`PAYMENT_DUPLICATE`) | IA | Bloqueante | Pendiente |
| P-05 | Renovación automática solo se activa con autorización explícita del socio (`autoRenew=true`) | RN-PAG-03 | `PATCH /members/me/auto-renew`, `POST /payments` | IA | Media | Pendiente |
| P-06 | El webhook de Culqi confirma el pago de forma idempotente y con firma verificada | RN-PAG-07 | `POST /payments/webhook` | IA | Alta | Pendiente |
| P-07 | Webhook con firma inválida se rechaza y no actualiza estado | RN-PAG-07 | `POST /payments/webhook` | IA + SEC | Alta | Pendiente |
| P-08 | Ningún request, respuesta, log ni ítem de DynamoDB contiene PAN, CVV ni secretos de Culqi | RN-PAG-08 | `POST /payments`, `POST /payments/webhook` | SEC | Bloqueante | Pendiente |
| P-09 | Socio con deuda o membresía vencida puede iniciar sesión y pagar | RN-PAG-06 | `GET /members/me`, `POST /payments` | E2E | Alta | Pendiente |
| P-10 | Socio con deuda o membresía vencida NO puede reservar (`canReserve=false`) | RN-PAG-06, RN-RES-12 | `GET /dashboard/member`, `POST /reservations` (`MEMBER_HAS_DEBT`) | IA + E2E | Bloqueante | Pendiente |
| P-11 | Pago exitoso/fallido dispara notificación correspondiente (`PAYMENT_SUCCEEDED`/`PAYMENT_FAILED`) | RN-NOT-04 | `POST /payments` | IA | Media | Pendiente |
| P-12 | Membresía anual ofrece facilidades de pago con tarjeta (`allowsInstallments`), sujeto a la integración disponible en Culqi | RN-PAG-02 | `GET /memberships/plans`, `POST /payments` | IA | Baja | Pendiente |

## 4. Reservas (RN-RES) — épica futura EP-05

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| R-01 | Reserva de fútbol/tenis/pádel/piscina con disponibilidad se confirma automáticamente (`CONFIRMED`) | RN-RES-01 | `POST /reservations`, `GET /resources/{id}/availability` | IA + E2E | Alta | Pendiente |
| R-02 | Reserva sin disponibilidad (franja ya completa) es rechazada o no ofrecida como slot disponible | RN-RES-01/09 | `GET /resources/{id}/availability`, `POST /reservations` | IA | Alta | Pendiente |
| R-03 | Reserva con cruce de horario para el mismo recurso → `409 RESERVATION_OVERLAP` | RN-RES-07 | `POST /reservations` | IA | Bloqueante | Pendiente |
| R-04 | Aforo excedido (participantes > capacidad del recurso) → `422 CAPACITY_EXCEEDED` | RN-RES-09 | `POST /reservations` | IA | Bloqueante | Pendiente |
| R-05 | Un socio no puede participar (como titular o invitado por otro socio) en dos reservas que se superponen en el tiempo → `409 PARTICIPANT_OVERLAP` | RN-RES-08 | `POST /reservations` | IA | Alta | Pendiente |
| R-06 | Un invitado externo no puede participar en dos reservas que se superponen en el tiempo | RN-RES-08 | `POST /reservations` | IA | Alta | Pendiente |
| R-07 | Un invitado externo no puede exceder 2 visitas en el mes → `429 GUEST_MONTHLY_LIMIT` | RN-RES-05 | `POST /reservations` | IA | Alta | Pendiente |
| R-08 | Invitados externos pueden asistir a cualquier espacio, incluida piscina | RN-RES-04 | `POST /reservations` | IA | Media | Pendiente |
| R-09 | El socio titular queda registrado como responsable (`HOLDER`) de la reserva y sus participantes | RN-RES-06 | `POST /reservations` | U + IA | Media | Pendiente |
| R-10 | Reserva fuera del horario del recurso/club → `422 OUTSIDE_SCHEDULE` | RN-RES (horarios mock) | `POST /reservations` | IA | Media | Pendiente |
| R-11 | Reserva de parrilla o salón social queda `PENDING_APPROVAL` (no se confirma automáticamente) | RN-RES-02 | `POST /reservations` | IA + E2E | Alta | Pendiente |
| R-12 | Admin aprueba reserva de parrilla/salón (`PENDING_APPROVAL → APPROVED`), notifica y audita | RN-RES-02, RN-ADM-05 | `POST /reservations/{id}/approve` | IA + E2E | Alta | Pendiente |
| R-13 | Admin rechaza reserva de parrilla/salón con motivo (`PENDING_APPROVAL → REJECTED`), notifica y audita | RN-RES-02, RN-ADM-05 | `POST /reservations/{id}/reject` | IA | Media | Pendiente |
| R-14 | Aprobar/rechazar una reserva que no está `PENDING_APPROVAL` → `409 RESERVATION_NOT_PENDING` | RN-RES-02 | `POST /reservations/{id}/approve\|reject` | IA | Media | Pendiente |
| R-15 | Cancelación permitida hasta 24h antes del inicio (socio, sobre su propia reserva) | RN-RES-10 | `POST /reservations/{id}/cancel` | IA + E2E | Alta | Pendiente |
| R-16 | Cancelación bloqueada si faltan menos de 24h (socio) → `422 CANCELLATION_TOO_LATE` | RN-RES-10 | `POST /reservations/{id}/cancel` | IA | Bloqueante | Pendiente |
| R-17 | El administrador puede cancelar sin restricción de 24h | RN-RES-10 | `POST /reservations/{id}/cancel` | IA | Media | Pendiente |
| R-18 | Cancelación decrementa el contador mensual de invitado si aplica | RN-RES-05, RN-RES-10 | `POST /reservations/{id}/cancel` | IA | Media | Pendiente |
| R-19 | Solo socios `ACTIVE` y sin deuda pueden crear una reserva | RN-RES-12, RN-PAG-06 | `POST /reservations` | IA | Bloqueante | Pendiente |
| R-20 | Admin bloquea un recurso por mantenimiento; el bloqueo colisiona con nuevas reservas en esa franja | RN-RES-11 | `POST /resources/{id}/maintenance` | IA | Alta | Pendiente |
| R-21 | Bloqueo de mantenimiento dispara notificación `RESOURCE_MAINTENANCE` a socios con reserva en ese recurso/franja | RN-RES-11, RN-NOT-04 | `POST /resources/{id}/maintenance` | IA | Alta | Pendiente |
| R-22 | Liberar un bloqueo de mantenimiento habilita nuevamente la franja | RN-RES-11, RN-ADM-04 | `DELETE /resources/{id}/maintenance/{blockId}` | IA | Media | Pendiente |
| R-23 | Admin actualiza aforo/horario/estado de un recurso y el cambio se refleja en disponibilidad | RN-ADM-04 | `PATCH /resources/{resourceId}` | IA | Media | Pendiente |
| R-24 | Una reserva admite agregar otros socios e invitados externos como participantes (no solo al titular) | RN-RES-03 | `POST /reservations` | IA | Media | Pendiente |

## 5. Notificaciones (RN-NOT) — épica futura EP-06

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| N-01 | El inbox interno de notificaciones existe y es obligatorio para todo socio | RN-NOT-01 | `GET /notifications` | IA + E2E | Alta | Pendiente |
| N-02 | Marcar una notificación como leída actualiza su estado (`UNREAD → READ`) | RN-NOT-01 | `POST /notifications/{id}/read` | IA | Baja | Pendiente |
| N-03 | Se envía correo transaccional para eventos relevantes cuando `alsoEmail=true` | RN-NOT-02 | `POST /notifications` | IA | Media | Pendiente |
| N-04 | Admin segmenta destinatarios: `ALL` | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-05 | Admin segmenta destinatarios: `ACTIVE` | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-06 | Admin segmenta destinatarios: `DEBT` | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-07 | Admin segmenta destinatarios: `EXPIRED` | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-08 | Admin segmenta destinatarios: `EXPIRING_SOON` | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-09 | Admin segmenta destinatarios: `SINGLE` (requiere `targetMemberId`) | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-10 | Admin segmenta destinatarios: `BY_RESOURCE` (requiere `resourceId`) | RN-NOT-03 | `POST /notifications` | IA | Media | Pendiente |
| N-11 | Eventos automáticos generan notificación esperada: activación, aprobación/rechazo, pago exitoso/fallido, renovación próxima/vencida, reserva confirmada/cancelada/aprobada/rechazada, mantenimiento, recordatorio | RN-NOT-04 | Múltiples (side-effect de cada endpoint) | IA | Media | Pendiente |
| N-12 | "Notificaciones enviadas" se refleja correctamente en analytics | RN-ANL-08 | `GET /notifications/sent` | IA | Baja | Pendiente |

## 6. Administración y auditoría (RN-ADM) — épica futura EP-07

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| AD-01 | Admin lista y filtra socios por estado (migrado, pendiente, activo, etc.) | RN-ADM-01 | `GET /members` | IA | Media | Pendiente |
| AD-02 | Admin consulta detalle de un socio, incluido estado de membresía y deuda | RN-ADM-03 | `GET /members/{memberId}` | IA | Media | Pendiente |
| AD-03 | Admin consulta pagos (histórico, filtrado) | RN-ADM-07 | `GET /payments` | IA | Baja | Pendiente |
| AD-04 | Admin consulta reservas (todas, filtradas por recurso/estado/fecha) | RN-ADM-07 | `GET /reservations?scope=all` | IA | Baja | Pendiente |
| AD-05 | Toda acción administrativa relevante queda auditada (`MEMBER_APPROVED`, `MEMBER_REJECTED`, `RESERVATION_APPROVED/REJECTED`, `RESOURCE_MAINTENANCE`, `NOTIFICATION_SENT`, `MIGRATION_RUN`) con actor, acción, objetivo y timestamp | RN-ADM-* (ADR-0008) | Interno (`AuditLog`), verificado vía endpoints que lo disparan | IA | Alta | Pendiente |
| AD-06 | Un socio (`member`) no puede acceder a endpoints exclusivos de admin → `403 FORBIDDEN` | Transversal (roles Cognito) | Todos los endpoints `admin` | IA + SEC | Bloqueante | Pendiente |
| AD-07 | Un usuario no autenticado no puede acceder a endpoints protegidos → `401 UNAUTHENTICATED` | Transversal (roles Cognito) | Endpoints `member`/`admin` | IA + SEC | Bloqueante | Pendiente |

## 7. Dashboards y analytics (RN-ANL) — épica futura EP-08

| # | Caso de prueba | Regla(s) | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|----------|-------------|------|-----------|--------|
| DA-01 | Dashboard del socio muestra `canReserve` coherente con estado activo/deuda/vencido | RN-PAG-06, RN-RES-12 | `GET /dashboard/member` | IA + E2E | Alta | Pendiente |
| DA-02 | Dashboard del socio muestra alertas de renovación próxima/vencida | RN-NOT-04 (evento), diseño | `GET /dashboard/member` | IA | Media | Pendiente |
| DA-03 | Dashboard admin: socios por estado | RN-ANL-01 | `GET /dashboard/admin` | IA | Media | Pendiente |
| DA-04 | Dashboard admin: membresías próximas a vencer | RN-ANL-02 | `GET /dashboard/admin` | IA | Media | Pendiente |
| DA-05 | Dashboard admin: reservas por instalación | RN-ANL-03 | `GET /dashboard/admin` | IA | Baja | Pendiente |
| DA-06 | Dashboard admin: reservas por día/horario | RN-ANL-04 | `GET /dashboard/admin` | IA | Baja | Pendiente |
| DA-07 | Dashboard admin: reservas pendientes de aprobación | RN-ANL-05 | `GET /dashboard/admin` | IA | Media | Pendiente |
| DA-08 | Dashboard admin: pagos exitosos y fallidos | RN-ANL-06 | `GET /dashboard/admin` | IA | Media | Pendiente |
| DA-09 | Dashboard admin: ocupación de instalaciones | RN-ANL-07 | `GET /dashboard/admin` | IA | Baja | Pendiente |

## 8. Transversal: responsividad, accesibilidad y seguridad de datos

| # | Caso de prueba | Regla(s) / origen | Endpoint(s) | Tipo | Severidad | Estado |
|---|-----------------|---------------------|-------------|------|-----------|--------|
| T-01 | Pantallas críticas (login, activación, dashboard, reserva, pago) se visualizan correctamente en viewport móvil y escritorio | US-008 (design foundation) | N/A (frontend) | E2E (viewports Playwright) + M | Media | Pendiente |
| T-02 | Accesibilidad básica: labels de formulario, foco visible, navegación por teclado, contraste mínimo | US-008 (design foundation) | N/A (frontend) | M + E2E (axe-core) | Media | Pendiente |
| T-03 | Estados de carga, error y vacío se muestran correctamente (p. ej. lista de reservas vacía, error de red al pagar) | Transversal (UX) | Todas las pantallas con datos remotos | IC + E2E | Media | Pendiente |
| T-04 | Ninguna respuesta de API, log de aplicación o componente de UI expone contraseña, `culqiToken`, PAN/CVV o secretos internos | RN-PAG-08, ADR-0008 | Todos los endpoints | SEC | Bloqueante | Pendiente |
| T-05 | Los mensajes de error de la UI usan el `error.code`/`message` del contrato, sin filtrar detalles internos (stack trace, nombres de tabla DynamoDB) | Formato de error estándar (§1.1 contratos-api.md) | Todos los endpoints | IC + SEC | Media | Pendiente |
| T-06 | Restricciones de permisos en UI: un socio no ve ni puede accionar controles exclusivos de admin, aunque conozca la URL | Transversal (roles) | Rutas `admin` del frontend | IC + E2E | Alta | Pendiente |

## 9. Resumen de cobertura por módulo

| Módulo | Casos definidos | Bloqueante | Alta | Media | Baja |
|--------|------------------|------------|------|-------|------|
| Migración | 5 | 1 | 3 | 1 | 0 |
| Activación/registro | 15 | 5 | 6 | 4 | 0 |
| Pagos | 12 | 3 | 4 | 4 | 1 |
| Reservas | 24 | 3 | 8 | 13 | 0 |
| Notificaciones | 12 | 0 | 1 | 9 | 2 |
| Administración/auditoría | 7 | 2 | 1 | 3 | 1 |
| Dashboards/analytics | 9 | 0 | 1 | 6 | 2 |
| Transversal (responsive/a11y/seguridad) | 6 | 1 | 1 | 4 | 0 |
| **Total** | **90** | **15** | **25** | **44** | **6** |

Todos los casos quedan en estado **pendiente** al cierre de Sprint 0. Esta
tabla se actualizará en cada sprint funcional a medida que los casos pasen a
`en progreso`, `pasa`/`falla` o `aprobado`, y a medida que se agreguen casos
nuevos que surjan de criterios de aceptación más detallados.

## 10. Referencias

- [Estrategia de pruebas](./estrategia-de-pruebas.md)
- [Reglas de negocio](../product/reglas-de-negocio.md)
- [Contratos de API](../api/contratos-api.md)
- [Modelo de datos DynamoDB](../data/modelo-dynamodb.md)

## Historial de cambios

- 2026-07-09: Versión inicial de la matriz de trazabilidad (US-006, Sprint 0). Todos los casos en estado pendiente.
