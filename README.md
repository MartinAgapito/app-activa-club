# Activa Club

[![PR Quality](https://github.com/MartinAgapito/app-activa-club/actions/workflows/pr-quality.yml/badge.svg)](https://github.com/MartinAgapito/app-activa-club/actions/workflows/pr-quality.yml)

Activa Club es una plataforma web responsive para modernizar un club deportivo
privado que actualmente opera con un sistema on-premise. El proyecto demuestra
la migración de datos hacia AWS y habilita una experiencia digital para socios
y administradores: activación de cuenta, membresías, pagos, reservas,
notificaciones y dashboards.

La fuente única de verdad sobre alcance, reglas de negocio y stack acordado es
[`docs/product/contexto-maestro.md`](docs/product/contexto-maestro.md).
Cualquier trabajo de producto, arquitectura o implementación debe alinearse con
ese documento.

## Contenido

- [Stack acordado](#stack-acordado)
- [Estado del proyecto](#estado-del-proyecto)
- [Mapa del proyecto (interactivo)](#mapa-del-proyecto-interactivo)
- [Requisitos previos y setup](#requisitos-previos)
- [Scripts disponibles](#scripts-disponibles-raíz)
- [Convención de commits](#convención-de-commits)
- [Metodología](#metodología)

## Stack acordado

- Frontend: React, TypeScript, Vite, Tailwind CSS, React Hook Form + Zod,
  TanStack Query.
- Backend: Node.js + TypeScript sobre AWS Lambda, Amazon API Gateway (REST).
- Autenticación: Amazon Cognito.
- Datos: Amazon DynamoDB (tabla única), Amazon S3 (archivos y JSON de migración).
- Correos: Amazon SES.
- Pagos: Stripe (test mode).
- Observabilidad: Amazon CloudWatch.
- Infraestructura como código: Terraform.
- CI/CD: GitHub Actions con OIDC hacia AWS.
- Pruebas: Vitest, React Testing Library, Playwright.
- Calidad: ESLint, Prettier, TypeScript estricto.

## Estado del proyecto

| Épica | Alcance                               | Estado      |
| ----- | ------------------------------------- | ----------- |
| EP-01 | Base cloud, arquitectura y gobernanza | Cerrada     |
| EP-02 | Migración, activación y acceso        | Cerrada     |
| EP-03 | Membresías y pagos (Stripe test mode) | Cerrada     |
| EP-04 | Reservas de instalaciones             | En progreso |
| EP-05 | Notificaciones                        | Planificada |
| EP-06 | Administración                        | Planificada |
| EP-07 | Dashboards y analytics                | Planificada |

**EP-04, detalle.** Las diez historias están implementadas, con backend y
pantallas: catálogo, disponibilidad, crear reserva (con candado de
concurrencia y participantes), Mis reservas, cancelar, aprobar o rechazar,
mantenimiento y gestión de recursos. Pendiente: la verificación extremo a
extremo contra `dev` (Ola 6). Detalle por historia en
[`docs/scrum/`](docs/scrum/README.md) y casos de prueba en
[`docs/testing/matriz-trazabilidad.md`](docs/testing/matriz-trazabilidad.md).

## Mapa del proyecto (interactivo)

Cada carpeta se despliega con el triángulo ▸. Los archivos `*.test.ts(x)` viven
junto al archivo que prueban y no se listan uno por uno.

Es un monorepo administrado con **npm workspaces**: cada app o paquete tiene su
propio `package.json` y extiende la configuración compartida de TypeScript,
ESLint y Prettier de la raíz.

<details>
<summary><strong>Raíz del repositorio</strong> — configuración del monorepo</summary>

| Archivo                                | Para qué sirve                                                             |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `package.json`                         | Define los workspaces (`apps/*`, `packages/*`) y los scripts globales.     |
| `package-lock.json`                    | Versiones exactas de dependencias; garantiza instalaciones reproducibles.  |
| `tsconfig.base.json`                   | Configuración de TypeScript estricto que extiende cada workspace.          |
| `eslint.config.js`                     | Reglas de lint compartidas por todo el monorepo.                           |
| `.prettierrc.json` / `.prettierignore` | Formato de código y qué archivos se excluyen.                              |
| `.editorconfig` / `.gitattributes`     | Convenciones de editor y fin de línea.                                     |
| `.nvmrc`                               | Versión de Node.js esperada.                                               |
| `.env.example`                         | Plantilla de variables de entorno (los valores reales nunca se versionan). |
| `.gitignore`                           | Excluye `node_modules`, builds, estado de Terraform y secretos.            |
| `CHANGELOG.md`                         | Historial de cambios por sprint.                                           |
| `CONTRIBUTING.md`                      | Reglas de contribución, ramas y Pull Requests.                             |

</details>

<details>
<summary><strong>apps/web</strong> — frontend React (SPA)</summary>

Configuración: `index.html` (entrada), `vite.config.ts` (Vite + Tailwind v4),
`vitest.setup.ts` (entorno de pruebas), `docs/` (design foundation y mapa de rutas).

<details>
<summary><code>src/</code> raíz de la aplicación</summary>

| Archivo             | Para qué sirve                                      |
| ------------------- | --------------------------------------------------- |
| `main.tsx`          | Punto de entrada: monta React en el DOM.            |
| `App.tsx`           | Componente raíz que renderiza el router.            |
| `index.css`         | Fuentes de las clases de utilidad de Tailwind.      |
| `styles/theme.css`  | Tokens de diseño (colores, tipografía, espaciado).  |
| `app/providers.tsx` | Providers globales: TanStack Query y autenticación. |

</details>

<details>
<summary><code>src/routes/</code> y <code>src/layouts/</code> — navegación y marcos de página</summary>

| Archivo                                 | Para qué sirve                                                   |
| --------------------------------------- | ---------------------------------------------------------------- |
| `routes/router.tsx`                     | Mapa completo de rutas públicas, de socio y de administrador.    |
| `routes/guards/RequireRole.tsx`         | Guard de UX por rol (la autorización real la valida el backend). |
| `routes/guards/RequireActiveMember.tsx` | Bloquea al socio que aún no está `ACTIVE`.                       |
| `layouts/PublicLayout.tsx`              | Marco de las pantallas públicas.                                 |
| `layouts/MemberLayout.tsx`              | Marco y navegación del socio.                                    |
| `layouts/AdminLayout.tsx`               | Marco y navegación del administrador.                            |
| `layouts/SectionNavLink.tsx`            | Enlace de navegación con estado activo accesible.                |

</details>

<details>
<summary><code>src/pages/</code> — pantallas</summary>

| Carpeta   | Pantallas                                                                                                                                                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public/` | `HomePage`, `LoginPage`, `RegisterPage`, `ActivationPage`, `ForgotPasswordPage`, `VerifyEmailPage` (placeholder).                                                                                                                                                                                                                                 |
| `member/` | `ProfilePage`, `MembershipPage`, `CheckoutPage`, `ReservationsPage` (reservar con participantes), `MyReservationsPage` (listar y cancelar). `PaymentsPage` (historial de pagos) y `NotificationsPage` (bandeja con pestañas y detalle). `MemberDashboardPage` es placeholder.                                                                     |
| `admin/`  | `PendingRequestsPage` (aprobar o rechazar socios), `ReservationsAdminPage` (bandeja de pendientes y todas las reservas) y `ResourcesMaintenancePage` (editar recursos y bloqueos de mantenimiento). El resto (`AdminDashboardPage`, `MembersManagementPage`, `MembershipsAdminPage`, `NotificationsAdminPage`, `AnalyticsPage`) son placeholders. |
| `shared/` | `ForbiddenPage`, `NotFoundPage`, `PendingApprovalPage`.                                                                                                                                                                                                                                                                                           |
| `dev/`    | `DesignSystemPage`: referencia interna, solo en modo desarrollo.                                                                                                                                                                                                                                                                                  |

</details>

<details>
<summary><code>src/auth/</code> — sesión y autenticación (Cognito)</summary>

| Archivo                                         | Para qué sirve                                         |
| ----------------------------------------------- | ------------------------------------------------------ |
| `AuthContext.tsx`                               | Estado de sesión, login, logout y rol del usuario.     |
| `cognito-client.ts`                             | Cliente mínimo contra Cognito (login y recuperación).  |
| `jwt.ts`                                        | Decodifica los claims del JWT (sin verificar firma).   |
| `session-storage.ts`                            | Persiste el refresh token en el cliente.               |
| `role-routes.ts`                                | A qué pantalla va cada rol tras iniciar sesión.        |
| `activation-client.ts` / `activation-schema.ts` | Activación de cuenta con DNI: llamada y validación.    |
| `registration-client.ts` / `register-schema.ts` | Registro de socio nuevo: llamada y validación.         |
| `login-schema.ts` / `forgot-password-schema.ts` | Validación de los formularios de login y recuperación. |

</details>

<details>
<summary><code>src/members/</code>, <code>payments/</code>, <code>resources/</code>, <code>admin/</code> — clientes de API por dominio</summary>

| Archivo                                                                | Para qué sirve                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------- |
| `members/profile-client.ts` / `profile-query.ts` / `profile-schema.ts` | Perfil propio: llamada, query compartida y validación.  |
| `members/plans-client.ts` / `plans-query.ts`                           | Planes de membresía disponibles.                        |
| `members/auto-renew-client.ts`                                         | Activar o desactivar la renovación automática.          |
| `payments/payments-client.ts`                                          | `POST /payments`.                                       |
| `payments/stripe.ts`                                                   | Integración con Stripe.js / Elements.                   |
| `payments/payment-outcome.ts`                                          | Traduce el resultado del cobro a un estado de pantalla. |
| `notifications/notifications-client.ts` / `notifications-query.ts`     | Bandeja del socio y marcar como leída (optimista).      |
| `resources/resources-client.ts` / `resources-query.ts`                 | Catálogo y disponibilidad de instalaciones.             |
| `admin/pending-members-client.ts`                                      | Solicitudes pendientes de socios nuevos.                |

</details>

<details>
<summary><code>src/lib/</code>, <code>components/</code>, <code>examples/</code>, <code>test/</code> — utilidades</summary>

| Archivo                                | Para qué sirve                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------- |
| `lib/api/http-client.ts`               | Cliente HTTP base: token, errores normalizados al formato del contrato.           |
| `lib/query-client.ts`                  | Configuración base de TanStack Query.                                             |
| `lib/format/*.ts`                      | Formato de moneda, fechas, hora de Lima y textos de estados y recursos.           |
| `components/UnderConstructionPage.tsx` | Placeholder reutilizable de pantallas aún no implementadas.                       |
| `examples/*`                           | Formulario y query de referencia del arquetipo (se ven en `/_dev/design-system`). |
| `test/fake-jwt.ts`                     | Construye un JWT de prueba (solo para tests).                                     |

</details>

</details>

<details>
<summary><strong>apps/api</strong> — backend serverless (una Lambda por endpoint: 33 HTTP + 2 no-HTTP, <code>memberships-expire</code> y <code>migration-run</code>)</summary>

Patrón en capas: **handler** (HTTP, auth y validación) → **orquestador** (reglas
de negocio) → **repositorio** (acceso a DynamoDB). Configuración: `package.json`,
`tsconfig.json`, `vitest.config.ts`, `README.md` (detalle técnico del backend).

<details>
<summary><code>src/handlers/</code> — capa HTTP (un archivo por endpoint)</summary>

| Carpeta              | Endpoints                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activation/`        | `POST /activation/verify`, `POST /activation/complete`.                                                                                                 |
| `registration/`      | `POST /registration`.                                                                                                                                   |
| `members/`           | `GET/PATCH /members/me`, `PATCH /members/me/auto-renew`, `GET /members`, `GET /members/{id}`, `POST …/approve`, `POST …/reject`, `GET /members/lookup`. |
| `memberships/`       | `GET /memberships/plans`; `expire.ts` es el proceso diario de vencimiento (EventBridge, no HTTP).                                                       |
| `payments/`          | `POST /payments`, `GET /payments`, `GET /payments/{id}`, `POST /payments/webhook`.                                                                      |
| `resources/`         | `GET /resources`, `PATCH /resources/{id}`, `POST/GET /resources/{id}/maintenance`, `DELETE /resources/{id}/maintenance/{blockId}`.                      |
| `reservations/`      | `availability`, `create`, `list`, `get-by-id`, `cancel`, `approve`, `reject`.                                                                           |
| `notifications/`     | `GET /notifications` (bandeja del socio), `POST /notifications/{id}/read`.                                                                              |
| `guests/`            | `GET /guests/lookup`.                                                                                                                                   |
| `migration/`         | `run.ts`: Lambda `migration-run`, carga inicial de socios por invocación directa (no HTTP, ADR-0012).                                                   |
| `health/`            | `GET /health`.                                                                                                                                          |
| `not-implemented.ts` | Placeholder para endpoints sin implementar. Hoy lo usan `POST /notifications` y `GET /notifications/sent` hasta US-048 y US-049.                        |

</details>

<details>
<summary><code>src/activation/</code>, <code>registration/</code>, <code>migration/</code> — acceso e ingreso de socios</summary>

| Archivo                                                      | Para qué sirve                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------- |
| `migration/run.ts`                                           | Orquesta la migración del JSON on-premise hacia DynamoDB.   |
| `migration/transform.ts`                                     | Transformación pura del JSON a ítems de DynamoDB.           |
| `migration/repository.ts`                                    | Escritura idempotente de cada socio migrado.                |
| `migration/fixtures/`                                        | JSON ficticio de prueba (no son socios reales).             |
| `activation/verify.ts` / `complete.ts`                       | Verifica el DNI y completa la activación de cuenta.         |
| `activation/transform.ts` / `repository.ts` / `cognito.ts`   | Transformación, persistencia y alta del usuario en Cognito. |
| `registration/register.ts`                                   | Registro de socio nuevo (queda `PENDING`).                  |
| `registration/transform.ts` / `repository.ts` / `cognito.ts` | Transformación, persistencia y alta en Cognito.             |

</details>

<details>
<summary><code>src/members/</code>, <code>payments/</code> — socios, membresías y pagos</summary>

| Archivo                                               | Para qué sirve                                              |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `members/repository.ts`                               | Acceso a datos del socio, compartido por varios endpoints.  |
| `members/decide.ts`                                   | Aprobar o rechazar un socio nuevo.                          |
| `members/update-profile.ts` / `update-auto-renew.ts`  | Actualizar perfil y renovación automática.                  |
| `members/lookup.ts`                                   | Resolver un socio por DNI (para participantes de reservas). |
| `payments/charge.ts`                                  | Orquesta el cobro idempotente de la membresía.              |
| `payments/eligibility.ts`                             | Qué estado de socio permite pagar.                          |
| `payments/idempotency.ts`                             | Evita cobros duplicados con la misma `idempotencyKey`.      |
| `payments/membership-cycle.ts`                        | Cálculo de vigencia de la membresía tras pagar.             |
| `memberships/vigency.ts`                              | Regla única de vigencia (umbral de 7 días, vencida).        |
| `memberships/expire-memberships.ts` / `repository.ts` | Proceso diario de vencimiento y rastro para avisos.         |
| `payments/plans.ts`                                   | Planes y montos (siempre resueltos en el servidor).         |
| `payments/repository.ts`                              | Persistencia de pagos y períodos de membresía.              |
| `payments/stripe-client.ts`                           | Cliente de cargos de Stripe test mode.                      |
| `payments/stripe-secret-key.ts` / `webhook-secret.ts` | Resuelven los secretos de Stripe desde SSM.                 |
| `payments/webhook.ts` / `webhook-event-schema.ts`     | Procesa y valida el evento del webhook.                     |

</details>

<details>
<summary><code>src/notifications/</code> — bandeja del socio (EP-05)</summary>

| Archivo         | Para qué sirve                                                                       |
| --------------- | ------------------------------------------------------------------------------------ |
| `list.ts`       | Bandeja del socio autenticado, paginada por cursor, con filtro de no leídas.         |
| `read.ts`       | Marca una notificación propia como leída (idempotente; ajena o inexistente: 404).    |
| `repository.ts` | Consulta de la bandeja (`MEMBER#<id>`, `NOTIF#`) y escritura condicional de lectura. |

</details>

<details>
<summary><code>src/reservations/</code> y <code>resources/</code> — reservas (EP-04)</summary>

| Archivo                                                  | Para qué sirve                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `create.ts`                                              | Crear reserva: elegibilidad, horario, mantenimiento, cruces, aforo, participantes. |
| `availability.ts`                                        | Franjas del día con su estado (libre, reservada, mantenimiento, pasada).           |
| `list.ts` / `get-by-id.ts`                               | Listado paginado y detalle de reservas.                                            |
| `cancel.ts`                                              | Cancelación con regla de 24 horas y devolución del cupo de invitado.               |
| `approve.ts` / `reject.ts`                               | Decisión administrativa de parrillas y salón social.                               |
| `repository.ts`                                          | Acceso a datos, candado de concurrencia y escrituras atómicas.                     |
| `slots.ts`                                               | Genera las franjas horarias y resuelve su estado.                                  |
| `overlap.ts`                                             | Cálculo de solapamiento entre intervalos.                                          |
| `time.ts`                                                | Conversión entre hora de Lima y UTC.                                               |
| `reservation-window.ts`                                  | Calcula `endsAt` a partir de `startsAt` y la duración del bloque.                  |
| `reservation-status.ts`                                  | Qué estados cuentan como "activos" para cruces.                                    |
| `cancellation.ts`                                        | Regla pura de las 24 horas.                                                        |
| `guest-month.ts`                                         | Mes calendario del contador de invitado.                                           |
| `resources/repository.ts`                                | Acceso al catálogo de instalaciones y edición de aforo, horario y estado.          |
| `resources/update.ts`                                    | Editar un recurso (solo aforo, horario y estado) con auditoría.                    |
| `resources/maintenance.ts` / `maintenance-repository.ts` | Crear, listar y liberar bloqueos de mantenimiento.                                 |
| `guests/lookup.ts`                                       | Resolver un invitado externo por DNI.                                              |

</details>

<details>
<summary><code>src/lib/</code>, <code>middleware/</code>, <code>testing/</code> — piezas transversales</summary>

| Archivo                        | Para qué sirve                                                   |
| ------------------------------ | ---------------------------------------------------------------- |
| `lib/dynamo.ts`                | Cliente de DynamoDB y constructores de claves de la tabla única. |
| `lib/errors.ts`                | `AppError` y mapa de códigos de error a HTTP.                    |
| `lib/http.ts`                  | Respuestas de API Gateway y validación de entrada con Zod.       |
| `lib/audit.ts`                 | Registro de auditoría administrativa (`AuditLog`).               |
| `lib/cursor.ts`                | Cursor opaco de paginación.                                      |
| `lib/env.ts` / `lib/logger.ts` | Variables de entorno tipadas y logging estructurado.             |
| `middleware/auth.ts`           | Extrae la identidad y exige rol.                                 |
| `middleware/with-handler.ts`   | Envoltorio común: logging y traducción de errores.               |
| `testing/fixtures.ts`          | Eventos de API Gateway de prueba (no se despliega).              |

</details>

</details>

<details>
<summary><strong>packages/</strong> — código compartido entre web y api</summary>

| Paquete         | Contenido                                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared-types/` | Contratos y tipos por dominio: `member`, `payment`, `reservation`, `notification`, `migration`, `dashboard`, `audit`, `common`. Es la fuente de verdad del formato de datos entre frontend y backend. |
| `validation/`   | Esquemas Zod por dominio (los mismos nombres que `shared-types`). Se usan en formularios y en los handlers, así una regla se escribe una sola vez.                                                    |
| `ui/`           | Componentes de la design foundation: `Button`, `Input`, `Textarea`, `Card`, `Badge`, `Spinner`, `EmptyState`, `ErrorState`, `ConfirmDialog`, `PageLayout`. Puramente presentacionales.                |

</details>

<details>
<summary><strong>infrastructure/terraform</strong> — toda la infraestructura AWS como código</summary>

<details>
<summary><code>bootstrap/</code> — base de la cuenta AWS</summary>

Crea lo que Terraform necesita para funcionar: bucket de estado remoto, tabla de
locks y el rol OIDC de GitHub Actions. Se aplica una sola vez con credenciales
elevadas. Su estado es local y **no se versiona**.

</details>

<details>
<summary><code>environments/</code> — entornos</summary>

| Carpeta | Para qué sirve                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `dev/`  | Entorno de desarrollo: API Gateway, Cognito, DynamoDB, un módulo `endpoint` por Lambda y hosting. Lo despliega el pipeline en cada merge. |
| `prd/`  | Entorno final para la presentación.                                                                                                       |

Cada entorno tiene `main.tf`, `providers.tf`, `variables.tf`, `outputs.tf` y un
`terraform.tfvars.example` (el `.tfvars` real no se versiona).

</details>

<details>
<summary><code>modules/</code> — piezas reutilizables</summary>

| Módulo              | Para qué sirve                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `endpoint`          | Una Lambda + método de API Gateway + permisos IAM mínimos + log group + alarma. |
| `dynamodb-table`    | Tabla única con sus índices GSI1, GSI2 y GSI3.                                  |
| `cognito-user-pool` | User Pool con grupos `member` y `admin` y App Client.                           |
| `frontend-hosting`  | S3 privado + CloudFront para servir la SPA.                                     |
| `s3-storage`        | Buckets de migración y de activos.                                              |
| `ses-identity`      | Identidad de remitente de correos.                                              |
| `log-group`         | CloudWatch Log Group con retención.                                             |
| `scheduled-job`     | Lambda programada con EventBridge + IAM mínima + log group + alarma de errores. |
| `resource-catalog`  | Carga las diez instalaciones del club como ítems de DynamoDB.                   |

</details>

</details>

<details>
<summary><strong>.github/</strong>, <strong>.husky/</strong>, <strong>scripts/</strong> — automatización</summary>

| Archivo                            | Para qué sirve                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `.github/workflows/pr-quality.yml` | Valida cada Pull Request: formato, lint, tipos, pruebas, build y seguridad.                   |
| `.github/workflows/deploy-dev.yml` | Al hacer merge a `main`, despliega a `dev` (Terraform + build + sincronización del frontend). |
| `.github/workflows/deploy-prd.yml` | Despliegue al entorno final.                                                                  |
| `.github/CODEOWNERS`               | Quién debe revisar cada área.                                                                 |
| `.github/PULL_REQUEST_TEMPLATE.md` | Plantilla de Pull Request.                                                                    |
| `.husky/pre-commit`                | Antes de cada commit: formatea y lintea lo modificado.                                        |
| `.husky/pre-push`                  | Antes de cada push: formato, lint, tipos y `terraform fmt`.                                   |
| `scripts/package-lambdas.mjs`      | Empaqueta cada handler real en un `.zip` para su Lambda.                                      |

</details>

<details>
<summary><strong>docs/</strong> — documentación</summary>

| Carpeta         | Contenido                                                                                |
| --------------- | ---------------------------------------------------------------------------------------- |
| `product/`      | `contexto-maestro` (fuente de verdad), visión, reglas de negocio y matriz de alcance.    |
| `scrum/`        | Épicas, historias de usuario (US-000 a US-037), sprints, definición de listo y de hecho. |
| `architecture/` | Visión general, ADRs 0001 a 0011 (decisiones técnicas) y riesgos.                        |
| `api/`          | `contratos-api.md`: contrato de cada endpoint.                                           |
| `data/`         | Modelo DynamoDB, diccionario de datos y mapeo de la migración.                           |
| `testing/`      | Estrategia de pruebas y matriz de trazabilidad (casos R-, A-, P-…).                      |
| `deployment/`   | Guías de CI, despliegue a `dev` y `prd`, y Terraform.                                    |
| `security/`     | Roles, permisos y lineamientos de seguridad.                                             |

</details>

<details>
<summary><strong>mock-data/</strong> — origen on-premise simulado</summary>

No versiona el JSON: el archivo que se ejecuta vive en el bucket S3 de
migración (ADR-0005) y la fuente de prueba versionada es el fixture ficticio de
`apps/api/src/migration/fixtures/`.

</details>

## Requisitos previos

- Node.js >= 20
- npm >= 10
- Git

## Setup

```bash
git clone <url-del-repositorio>
cd _Tesis-app
npm install
cp .env.example .env   # completar valores reales localmente, nunca commitear
```

## Scripts disponibles (raíz)

```bash
npm run lint           # ESLint en todo el monorepo
npm run lint:fix       # ESLint con autofix
npm run format         # Prettier --write en todo el monorepo
npm run format:check   # Prettier --check (usado en CI)
npm run typecheck      # tsc --noEmit en cada workspace que lo defina
npm run build          # build en cada workspace que lo defina
npm run test           # tests en cada workspace que lo defina
```

## Convención de commits

Este proyecto usa obligatoriamente [Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/)
para todos los commits, por ejemplo:

```
feat(api): agregar validación de DNI en activación de cuenta
fix(web): corregir cálculo de días restantes de membresía
docs(scrum): agregar historia US-011
chore(infra): configurar backend remoto de Terraform
```

Tipos habituales: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`,
`build`, `perf`. El scope debe reflejar el área afectada (`web`, `api`,
`shared-types`, `validation`, `ui`, `infra`, `scrum`, etc.). El detalle de ramas
y Pull Requests está en [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Metodología

Toda funcionalidad parte de una historia de usuario aprobada con criterios de
aceptación verificables, con trazabilidad entre épica, historia, tarea, código,
pruebas y Pull Request. Ver `docs/product/contexto-maestro.md`, sección
"Metodología Scrum".
