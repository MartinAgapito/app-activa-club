# Infraestructura base con Terraform (US-004)

Este documento describe la base de Terraform en
[`infrastructure/terraform/`](../../infrastructure/terraform/): estructura de
módulos, backend de estado, entornos, variables/secretos y el procedimiento de
aplicación manual controlada. Complementa (no duplica) el pipeline de calidad
de PR descrito en [`ci-pull-request.md`](./ci-pull-request.md).

> Alcance de US-004: dejar la **base** lista y validada (`terraform fmt`,
> `terraform validate`). **No se ha ejecutado `terraform apply` sobre ningún
> entorno**: no existe todavía una cuenta AWS designada para el proyecto ni
> recursos reales desplegados. Tampoco se declaran Lambdas ni API Gateway
> (Sprint 1, cuando exista el código real de `apps/api`).

## 1. Estructura de directorios

```
infrastructure/terraform/
├── bootstrap/            # Backend de estado remoto + OIDC de GitHub (aplicación manual, única vez)
├── modules/               # Módulos reutilizables, sin estado propio
│   ├── dynamodb-table/
│   ├── cognito-user-pool/
│   ├── s3-storage/         # buckets de migración + activos
│   ├── frontend-hosting/   # bucket web + CloudFront + OAC
│   ├── ses-identity/
│   ├── log-group/          # CloudWatch Log Group genérico y reutilizable
│   └── endpoint/            # placeholder Lambda+ruta+authorizer (Sprint 1, sin recursos aún)
└── environments/
    ├── dev/                # raíz de Terraform del entorno dev
    └── prd/                # raíz de Terraform del entorno prd
```

### Por qué carpetas por entorno en vez de workspaces

Se eligió el patrón `environments/<env>` con módulos compartidos en
`modules/`, en vez de Terraform workspaces, por:

- **Backend de estado separado por entorno de forma explícita** (impacto
  registrado en [ADR-0001](../architecture/adr/ADR-0001-estrategia-entornos.md):
  "backend de estado separado por entorno"). Con carpetas, cada entorno tiene
  su propio bloque `backend` y su propio archivo de estado sin ambigüedad;
  con workspaces es fácil aplicar sobre el workspace equivocado por olvido de
  `terraform workspace select`.
- **Aislamiento a prueba de error humano**: al ser directorios distintos, un
  `terraform apply` ejecutado en `environments/dev` físicamente no puede
  tocar el estado de `prd` (evita el escenario de romper la demo del jurado
  por un error de contexto).
- **Variables por entorno explícitas y auditable en PR** (`terraform.tfvars`
  por carpeta) en vez de variables condicionadas por el nombre del workspace
  activo.
- Costo de mantenimiento aceptable: solo dos entornos (`dev`, `prd`, ver
  ADR-0001), la duplicación de los `main.tf`/`providers.tf` de cada raíz es
  mínima y los recursos reales viven en `modules/` (sin duplicación de
  lógica).

## 2. Backend de estado — estado actual y plan de migración

**Hoy: backend local.** Ningún `environments/<env>/providers.tf` tiene un
bloque `backend` activo; Terraform usa el backend local por defecto
(`.terraform/terraform.tfstate` en cada raíz). Ese archivo está excluido por
`.gitignore` (`*.tfstate`, `**/.terraform/`) y **nunca debe commitearse**.
Razón: no existe todavía una cuenta AWS designada para el proyecto, por lo
que no tiene sentido aplicar un backend remoto real todavía (criterio de
aceptación US-004 #4/#7: validar sin desplegar funcionalidad de negocio).

**Excepción justificada** (según el criterio de aceptación "casos
alternativos" de US-004): el backend remoto (bucket S3 + tabla DynamoDB de
lock) y el proveedor OIDC de GitHub no pueden crearse desde el propio estado
que van a alojar (problema del huevo y la gallina). Por eso viven en
[`infrastructure/terraform/bootstrap/`](../../infrastructure/terraform/bootstrap/),
una raíz de Terraform aparte que:

- Usa **estado local** de forma intencional y permanente (no se migra).
- Se aplica **una sola vez**, manualmente, por una persona con permisos
  elevados en la cuenta AWS del proyecto (no vía CI).
- Declara: bucket S3 versionado/cifrado/privado para el estado remoto, tabla
  DynamoDB de lock, el proveedor OIDC de GitHub Actions y un rol IAM de
  **solo lectura** (`terraform plan`) para el job `terraform` de
  `pr-quality.yml`.

### Plan de migración a backend remoto (cuando exista la cuenta AWS del proyecto)

1. Configurar credenciales de una persona con permisos elevados en esa
   cuenta (no las credenciales de CI).
2. `cd infrastructure/terraform/bootstrap`, copiar
   `terraform.tfvars.example` → `terraform.tfvars` y completar
   `github_org`/`github_repo` reales.
3. `terraform init && terraform plan` (revisar el plan) y luego
   `terraform apply` (fuera del alcance de US-004; historia/tarea posterior).
4. Copiar los outputs (`state_bucket_name`, `state_lock_table_name`,
   `github_actions_plan_role_arn`) a:
   - Los bloques `backend "s3"` comentados en
     `environments/dev/providers.tf` y `environments/prd/providers.tf`
     (descomentar y completar).
   - El secreto de repositorio `AWS_OIDC_ROLE_ARN` (ya referenciado por
     `.github/workflows/pr-quality.yml`, ver US-005).
5. En cada entorno: `terraform init -migrate-state` para mover el estado
   local existente (si lo hubiera) al backend S3.

## 3. Entornos

Dos entornos, según [ADR-0001](../architecture/adr/ADR-0001-estrategia-entornos.md):

| Entorno | Carpeta             | Propósito                                                        |
| ------- | ------------------- | ---------------------------------------------------------------- |
| `dev`   | `environments/dev/` | Trabajo diario, despliegues frecuentes                           |
| `prd`   | `environments/prd/` | Presentación al jurado, desplegado desde rama principal validada |

Ambos comparten los mismos módulos; solo cambian variables (`environment`,
`ses_sender_email`, y potencialmente `aws_region`/cuenta si en el futuro se
separan cuentas AWS).

## 4. Recursos base declarados (módulos)

| Módulo                               | Recursos                                                                                                                                       | Referencia                                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `modules/dynamodb-table`             | Tabla única `activa-club-<env>`, GSI1/GSI2/GSI3, TTL `expiresAt`, PITR, cifrado, `prevent_destroy`                                             | [modelo-dynamodb.md](../data/modelo-dynamodb.md), [ADR-0003](../architecture/adr/ADR-0003-dynamodb-single-table.md) |
| `modules/cognito-user-pool`          | User Pool, App Client web, grupos `member`/`admin`                                                                                             | [ADR-0002](../architecture/adr/ADR-0002-autenticacion-cognito-roles.md)                                             |
| `modules/s3-storage`                 | Bucket de migración (versionado) + bucket de activos, privados y cifrados                                                                      | [ADR-0005](../architecture/adr/ADR-0005-s3-migracion-activos-hosting.md)                                            |
| `modules/frontend-hosting`           | Bucket web privado + CloudFront + Origin Access Control                                                                                        | [ADR-0005](../architecture/adr/ADR-0005-s3-migracion-activos-hosting.md)                                            |
| `modules/ses-identity`               | Identidad de correo remitente verificada por entorno                                                                                           | [ADR-0006](../architecture/adr/ADR-0006-ses-correos-transaccionales.md)                                             |
| `modules/log-group`                  | CloudWatch Log Group genérico y reutilizable (retención parametrizable, default 14 días)                                                       | [ADR-0008](../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md)                                        |
| `modules/endpoint`                   | **Placeholder sin recursos** (Lambda + ruta API Gateway + Cognito Authorizer + rol IAM + log group), interfaz de variables lista para Sprint 1 | [ADR-0004](../architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md)                                    |
| `infrastructure/terraform/bootstrap` | Backend de estado (S3+DynamoDB), proveedor OIDC de GitHub, rol IAM de solo lectura para CI                                                     | Este documento, sección 2                                                                                           |

**No se declaran** todavía: funciones Lambda, API Gateway, alarmas de
CloudWatch específicas por endpoint, plantillas SES, ni el permiso
`ses:SendEmail`/`dynamodb:*` de cada Lambda — todo eso depende del código
real de `apps/api` (Sprint 1, US-009) y se agrega completando
`modules/endpoint` (ver su `README.md`).

## 5. Variables y secretos requeridos por entorno

| Variable                    | Dónde se define                                                                   | Tipo                                    | Notas                                                                      |
| --------------------------- | --------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `ses_sender_email`          | `environments/<env>/terraform.tfvars` (no versionado) o `TF_VAR_ses_sender_email` | No secreta, pero específica del entorno | Ver `terraform.tfvars.example` en cada entorno                             |
| `AWS_OIDC_ROLE_ARN`         | Secreto de repositorio GitHub                                                     | Secreto                                 | Rol de solo lectura de `bootstrap` (output `github_actions_plan_role_arn`) |
| `AWS_REGION`                | Variable de repositorio GitHub (opcional)                                         | No secreta                              | Default `us-east-1` si no se define (ver `pr-quality.yml`)                 |
| `github_org`, `github_repo` | `bootstrap/terraform.tfvars` (no versionado)                                      | No secretas                             | Solo para aplicar `bootstrap` manualmente                                  |

Ningún archivo `terraform.tfvars` real se versiona (`.gitignore` ya excluye
`*.tfvars` y permite `*.tfvars.example`). Ninguna clave AWS estática se usa
en ningún punto (OIDC exclusivamente, ver sección 6).

## 6. Autenticación OIDC de GitHub Actions

- `bootstrap` crea el proveedor OIDC (`token.actions.githubusercontent.com`)
  y el rol `activa-club-github-actions-plan`, de **solo lectura**
  (equivalente a `terraform plan`; sin permisos de escritura/`apply`).
- El trust policy de ese rol restringe el `sub` del token a este repositorio
  exacto, para `pull_request` y `push` a `main`/`master` (alineado con los
  disparadores de `pr-quality.yml`).
- `bootstrap` además declara `activa-club-github-actions-deploy-dev`: rol de
  **escritura** para el pipeline de despliegue real a dev
  (`deploy-dev.yml`, ver [`despliegue-dev.md`](./despliegue-dev.md)). A
  diferencia del rol de plan:
  - Su trust policy **solo** acepta el claim `sub` de un push directo a
    `main` (nunca `pull_request`): ningún PR puede obtener credenciales de
    escritura de este rol.
  - Su alcance está acotado a los recursos de `dev` que ese pipeline
    necesita tocar: funciones Lambda y sus roles de ejecución (con
    `iam:PassRole` condicionado a `iam:PassedToService = lambda.amazonaws.com`),
    API Gateway, la tabla DynamoDB de dev, los log groups/alarmas de cada
    función, más `s3:PutObject`/`DeleteObject`/`ListBucket` sobre el bucket
    del frontend y `cloudfront:CreateInvalidation` (condicionado por tags
    `Project`/`Environment`) sobre la distribución de dev — nunca sobre los
    recursos de `prd`.
  - **No se aplica automáticamente**: como el resto de `bootstrap`, el
    `terraform apply` que crea este rol en AWS sigue siendo manual, nunca
    desde CI. Hasta que se aplique y se copie su ARN al secreto
    `AWS_DEPLOY_DEV_ROLE_ARN`, `deploy-dev.yml` no puede ejecutarse con
    éxito.
- El rol de escritura de **prd** (con aprobación manual del GitHub
  Environment `prd`) es trabajo de una historia posterior: `deploy-prd.yml`
  ya existe (ver [`despliegue-prd.md`](./despliegue-prd.md)) pero su
  primer job falla explícitamente mientras ese rol y el secreto
  correspondiente no existan, precisamente para no dejar un `apply`
  automatizable contra un entorno (`prd`) que todavía no fue aprovisionado.

## 7. Aplicación manual controlada (procedimiento, cuando exista cuenta AWS)

1. **Nunca** desde el equipo local con credenciales personales para cambios
   que afecten `prd`: usar siempre el pipeline de CI con revisión humana
   una vez exista (dev deploy / prd deploy).
2. Para `dev` en esta etapa (Sprint 0, sin pipeline de despliegue aún):
   ```bash
   cd infrastructure/terraform/environments/dev
   terraform init
   terraform plan -out=tfplan
   # Revisar el plan línea por línea antes de aplicar.
   terraform apply tfplan
   ```
3. Para `prd`: mismo procedimiento, pero solo tras validar en `dev` y con
   doble revisión (Arquitecto/DevOps), dado que es el entorno de la
   presentación al jurado.
4. `prevent_destroy = true` protege la tabla DynamoDB y los buckets S3 de
   destrucción accidental por `terraform destroy`/recreación; para un reset
   deliberado, quitar el bloque `lifecycle` temporalmente, aplicar, y
   restaurarlo.

## 8. Validación ejecutada durante US-004

Sin credenciales AWS del proyecto (no existe cuenta designada), se validó
solo estructura/sintaxis, **sin `apply` ni `plan` contra AWS real**:

```bash
cd infrastructure/terraform
terraform fmt -recursive -diff        # sin diferencias tras corregir formato

cd bootstrap && terraform init -backend=false && terraform validate
cd ../environments/dev && terraform init -backend=false && terraform validate
cd ../prd && terraform init -backend=false && terraform validate
cd ../../modules/endpoint && terraform init -backend=false && terraform validate
cd ../log-group && terraform init -backend=false && terraform validate
```

Todas las validaciones anteriores terminaron en `Success! The configuration
is valid.`

**Limitación explícita**: la máquina donde se ejecutó esta historia tiene
credenciales de AWS CLI configuradas localmente, pero pertenecen a una
cuenta personal ajena al proyecto Activa Club. Deliberadamente **no se
usaron** para correr `terraform plan` contra esa cuenta (no es la cuenta del
proyecto y hacerlo sería una operación fuera de alcance/potencialmente
insegura). `terraform plan` real queda pendiente hasta que exista una cuenta
AWS designada para Activa Club y se complete la sección 2 (backend remoto) y
el rol OIDC de `bootstrap`.

## 9. Tags/etiquetas

Todos los recursos aplican, como mínimo: `Project = "activa-club"`,
`Environment = "dev"|"prd"` y `ManagedBy = "terraform"` (vía `default_tags`
del provider `aws` en cada raíz, más `tags`/`Name` explícitos en cada
recurso de los módulos). `bootstrap` usa `Component = "bootstrap"` en vez de
`Environment`, ya que es un módulo compartido de aplicación manual única
(ver cabecera de `infrastructure/terraform/bootstrap/main.tf`).

Esta convención de tagging existe precisamente para poder auditar qué
recursos pertenecen al proyecto: una vez exista la cuenta AWS designada, se
debe usar **AWS Resource Groups & Tag Editor** (consola, sin costo) filtrando
por `Project = activa-club` para ver de un vistazo todo lo desplegado, y
activar esas mismas claves (`Project`, `Environment`) como **cost allocation
tags** en Billing para desglosar el gasto por entorno. Cualquier recurso que
no aparezca ahí filtrando por `Project = activa-club` no fue creado por este
Terraform y debe tratarse como sospechoso de estar huérfano.

## 10. Riesgos

- **Costo**: todos los servicios usados son de bajo costo/serverless
  (DynamoDB on-demand, S3, Cognito, SES sandbox, CloudFront `PriceClass_100`).
  Sin recursos "siempre encendidos" de costo fijo alto. `bootstrap` agrega
  un bucket S3 y una tabla DynamoDB pequeños (costo marginal).
- **Seguridad**: sin credenciales estáticas en CI (OIDC); rol de CI limitado
  a solo lectura; buckets privados con bloqueo de acceso público; cifrado en
  reposo por defecto.
- **Destrucción accidental**: mitigada con `prevent_destroy` en DynamoDB y
  en los buckets S3; aun así, un cambio que fuerce reemplazo (p. ej. cambiar
  la clave primaria) requeriría remover el `lifecycle` a propósito — nunca
  hacerlo sin respaldo previo.
- **Cuenta AWS compartida/ajena**: como no existe aún cuenta AWS del
  proyecto, cualquier futura ejecución de `terraform plan`/`apply` debe
  verificarse primero contra el `account_id` esperado (`aws sts
get-caller-identity`) antes de continuar, para evitar aplicar contra una
  cuenta incorrecta.

## 11. Notificaciones y envío de correo (EP-05, US-039)

Todo vive en `infrastructure/terraform/environments/dev/main.tf`; no hay
módulos nuevos (se reutiliza `modules/endpoint` y `modules/ses-identity`).

**Endpoints** (módulo `endpoint`). Los cuatro están **implementados**: la
bandeja y el marcado como leída (US-041) y la publicación y el historial
(US-048) ya no responden el placeholder 501 de `handlers/not-implemented.ts`.
La consola de administración que los consume es US-049:

| Módulo                          | Método y ruta                                   | Grupo  | IAM de DynamoDB (mínimo privilegio)                                              |
| ------------------------------- | ----------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| `endpoint_notifications_list`   | `GET /api/notifications`                        | member | `Query` sobre tabla + `GSI1`                                                     |
| `endpoint_notifications_read`   | `POST /api/notifications/{notificationId}/read` | member | `GetItem`, `Query`, `UpdateItem` sobre tabla + `GSI1`                            |
| `endpoint_notifications_create` | `POST /api/notifications`                       | admin  | `GetItem`, `PutItem` sobre tabla; `Query` sobre `GSI2` y `GSI3`; `ses:SendEmail` |
| `endpoint_notifications_sent`   | `GET /api/notifications/sent`                   | admin  | `Query` solo sobre `GSI2`                                                        |

Árbol de rutas: nodos nuevos `notifications` (nivel 1), `notifications/sent` y
`notifications/{notificationId}` (nivel 2, hermanos: el literal tiene prioridad
sobre el parámetro, igual que `members/lookup` y `members/{memberId}`) y
`notifications/{notificationId}/read` (nivel 3).

**Permiso de correo**: `ses:SendEmail` sobre `module.ses.identity_arn` (solo la
identidad remitente del entorno; nunca `ses:*`, ni `SendRawEmail`). Más la
variable de entorno `SES_SENDER_EMAIL` (no secreta). Lo reciben las 11 Lambdas
emisoras y `notifications-create`:

> **Sandbox de SES.** Mientras la cuenta esté en el sandbox, SES evalúa `ses:SendEmail` también contra la identidad de cada destinatario; por eso el recurso incluye `identity/*` de la cuenta y región, acotado con la condición `ses:FromAddress` al remitente verificado. Al salir del sandbox basta con volver a la sola identidad del remitente.

> **Nombre visible del remitente.** El código envía `FromEmailAddress` como `Activa Club <SES_SENDER_EMAIL>`. La condición `StringEquals ses:FromAddress` evalúa solo la dirección de correo (la parte entre `<>`), no el nombre, por lo que el permiso sigue cumpliéndose sin cambios de Terraform. Las Lambdas no reciben aún `APP_BASE_URL` (opcional, habilita el botón de los correos); agregarla es un cambio de infraestructura aparte.

| Lambda                                                  | Permiso nuevo                                        |
| ------------------------------------------------------- | ---------------------------------------------------- |
| `activation-complete`                                   | `ses:SendEmail`                                      |
| `members-approve`, `members-reject`                     | `ses:SendEmail`                                      |
| `payments-create`, `payments-webhook`                   | `ses:SendEmail`                                      |
| `reservations-create`, `-cancel`, `-approve`, `-reject` | `ses:SendEmail`                                      |
| `resources-maintenance-create`                          | `ses:SendEmail`                                      |
| `resources-update`                                      | `ses:SendEmail` y `dynamodb:Query` solo sobre `GSI3` |

Las escrituras de `Notification` y `MemberNotification` no requirieron permiso
nuevo: las 11 ya tienen `dynamodb:PutItem` sobre la tabla (auditoría o datos de
negocio) y ese mismo `PutItem` cubre ambas entidades. `resources-update` es la
única que no podía consultar reservas (necesaria para avisar a los titulares al
pasar un recurso a mantenimiento, US-045) y recibe `Query` acotado a `GSI3`.

**Alarmas** (ADR-0008): los cuatro endpoints nuevos con `enable_error_alarm =
false`, para no superar las 10 alarmas de la capa gratuita de CloudWatch. Sí
tienen log group con retención.

**Tiempo máximo de `POST /notifications`**: 29 s (límite de integración de API
Gateway REST; más no serviría). Cálculo para el padrón mock completo (decenas
a un centenar de socios): escritura en DynamoDB ~10-20 ms por destinatario y
una llamada a SES por destinatario con `alsoEmail` (~50-150 ms; los destinatarios
no verificados en sandbox se rechazan de inmediato). Alcanza con holgura. Límite
real a vigilar: en sandbox SES acepta 1 mensaje por segundo y 200 por día, así
que muchos destinatarios _verificados_ no caben en 29 s; US-048 debe acotar el
bucle de correo por tiempo y, si hace falta, escalar al Arquitecto (nunca
publicar a medias en la bandeja).

**Verificar un destinatario de prueba en el sandbox de SES** (la identidad
remitente ya está verificada):

```bash
aws ses verify-email-identity --email-address <correo-de-prueba> --profile activa-club-dev
```

AWS envía un correo con un enlace; al abrirlo el destinatario queda verificado
y puede recibir correos en `dev`. Salir del sandbox queda fuera del alcance
(ADR-0006).

**Rol de despliegue de CI**: no necesita permisos nuevos. Crear/actualizar
roles, políticas, Lambdas, rutas y log groups de `activa-club-dev-*` ya está
cubierto por `github_actions_deploy_dev`; conceder `ses:SendEmail` dentro de la
política de un rol de Lambda no exige ningún permiso SES al desplegador.

**Rollback**: revertir el PR y desplegar de nuevo; los cuatro endpoints y los
statements se eliminan. No hay datos que borrar (no se crean tablas ni ítems).

### Proceso programado de avisos de renovación (US-047)

Segunda instancia de `modules/scheduled-job` (`job_memberships_notify`,
función `activa-club-dev-memberships-notify`), sin módulo ni recurso nuevos:

| Aspecto   | Valor                                                                                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Horario   | `cron(0 13 * * ? *)` = 08:00 America/Lima (UTC-5 fijo). Corre ocho horas después de `memberships-expire` (00:15), que es quien deja el rastro `MembershipTransition` que consume.             |
| IAM       | `dynamodb:GetItem`, `PutItem`, `UpdateItem` sobre la tabla; `dynamodb:Query` solo sobre `index/GSI2` (patrón #27); `ses:SendEmail` solo sobre la identidad del remitente. Sin Scan ni Delete. |
| Variables | `DYNAMODB_TABLE_NAME`, `SES_SENDER_EMAIL`.                                                                                                                                                    |
| Alarma    | `activa-club-dev-memberships-notify-errors` (el handler termina en error si algún aviso no pudo registrarse).                                                                                 |

Por qué un job aparte y no al final de `memberships-expire`: el aviso y su
correo llegan en horario de vigilia, y un fallo de SES o de la bandeja no puede
contaminar al proceso crítico que mantiene `membershipStatus` correcto
(RN-PAG-06). Si la ejecución falla, el rastro queda pendiente en GSI2 y el
siguiente día lo reintenta.

**Alarmas CloudWatch en `dev`**: con esta historia son **11** (10 existentes en
el estado + 1). La capa gratuita cubre 10; la alarma 11 cuesta unos US$ 0,10 al
mes. Para volver a 10, poner `enable_error_alarm = false` en esta instancia o en
una alarma de menor valor (p. ej. `members-reject`) antes del `apply`.

**Rollback**: revertir el PR; se destruyen la regla, el rol, la Lambda, el log
group y la alarma. Los rastros pendientes siguen en la tabla hasta que otro
consumidor los procese.

## 12. Recordatorio de reservas (EP-05, US-046)

Una instancia más del módulo `scheduled-job` en
`infrastructure/terraform/environments/dev/main.tf`
(`module.job_reservations_remind`); no hay módulos nuevos. Es la segunda
Lambda programada del proyecto (la primera es `memberships-expire`, US-038).

| Propiedad    | Valor                                                                                   |
| ------------ | --------------------------------------------------------------------------------------- |
| Función      | `activa-club-dev-reservations-remind` (`handlers/reservations/remind.ts`)               |
| Programación | `cron(0 23 * * ? *)`: 18:00 America/Lima (UTC-5 todo el año; EventBridge evalúa en UTC) |
| Timeout      | 300 s (el lote real dura segundos; acota un cuelgue de SES o DynamoDB)                  |
| Entorno      | `DYNAMODB_TABLE_NAME`, `SES_SENDER_EMAIL`                                               |
| Alarma       | `activa-club-dev-reservations-remind-errors` (métrica `Errors`, ADR-0008)               |

**IAM (mínimo privilegio, verificado contra el código)**:

| Acción             | Recurso                 | Uso en el código                                                             |
| ------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| `dynamodb:GetItem` | tabla                   | `Resource` por id (nombre) y `Member` por id (titular)                       |
| `dynamodb:Query`   | solo `index/GSI3`       | reservas por recurso y rango (patrón 21)                                     |
| `dynamodb:PutItem` | tabla                   | `Notification` + `MemberNotification` (`TransactWriteItems` exige `PutItem`) |
| `ses:SendEmail`    | identidad del remitente | correo best-effort del recordatorio                                          |

Sin `Scan`, `UpdateItem` ni `DeleteItem`.

**Alarmas**: este job suma una alarma. Con US-038 y los endpoints críticos
quedan 11 alarmas en `dev`, una por encima de las 10 de la capa gratuita de
CloudWatch (costo aproximado de la alarma adicional: 0,10 USD al mes). El
criterio 7 de US-046 exige alarma; si se quiere volver a 10, la opción es
poner `enable_error_alarm = false` en un endpoint de bajo riesgo (p. ej.
`endpoint_reservations_reject`).

**Rol de despliegue de CI**: no necesita permisos nuevos; las reglas
`events:*` acotadas a `activa-club-dev-*` y `lambda:AddPermission` ya existen
desde US-038.

**Rollback**: revertir el PR y desplegar; la regla, la Lambda, la alarma y el
rol se destruyen. No hay datos que borrar (los avisos ya emitidos quedan en la
bandeja de los socios).

## 13. Dashboards (EP-07, US-054)

Todo vive en `infrastructure/terraform/environments/dev/main.tf`; no hay
módulos nuevos (se reutiliza `modules/endpoint`).

**Endpoints** (módulo `endpoint`, sin lógica de negocio: placeholder 501 de
`handlers/not-implemented.ts` hasta US-055, US-057 y US-058):

| Módulo                      | Método y ruta               | Grupo  | IAM de DynamoDB (solo lectura)                            |
| --------------------------- | --------------------------- | ------ | --------------------------------------------------------- |
| `endpoint_dashboard_member` | `GET /api/dashboard/member` | member | `GetItem`, `Query` sobre tabla + `GSI1` + `GSI2`          |
| `endpoint_dashboard_admin`  | `GET /api/dashboard/admin`  | admin  | `GetItem`, `Query` sobre tabla + `GSI1` + `GSI2` + `GSI3` |

Cada índice es un ARN explícito (`${table_arn}/index/GSIx`), no el comodín
`index/*`. Sin `Scan`, sin escritura y sin `ses:SendEmail` (no envían correo).
Árbol de rutas: nodos nuevos `dashboard` (nivel 1) y `dashboard/member` y
`dashboard/admin` (nivel 2, hojas literales sin parámetros).

**Tiempo máximo y memoria de `GET /dashboard/admin`**: 29 s (límite de
integración de API Gateway REST; un valor mayor no serviría) y 512 MB. La
Lambda recorre el catálogo de diez recursos y los conteos por estado: unas
decenas de `Query` de 10 a 30 ms, del orden de 1 a 3 s con el volumen mock; el
resto es holgura para arranque en frío y paginación. Se factura por duración
real, así que un máximo alto no cuesta más. `dashboard-member` queda con los
valores por defecto del módulo (pocas lecturas por clave).

**Alarmas** (ADR-0008): ambos endpoints con `enable_error_alarm = false` para
no sumar alarmas sobre el límite de 10 de la capa gratuita de CloudWatch (ver
secciones 11 y 12). Sí tienen log group con retención.

**Rol de despliegue de CI**: no necesita permisos nuevos (mismos recursos
`activa-club-dev-*` ya cubiertos por `github_actions_deploy_dev`).

**Verificación tras el despliegue**: sin token 401; token `admin` en
`/dashboard/member` y token `member` en `/dashboard/admin` 403; con el rol
correcto 501 hasta que se implementen las historias de backend. El despliegue
redespliega el stage (los IDs de método entran al trigger) y CloudFront sigue
sirviendo `/api/*`.

**Rollback**: revertir el PR y desplegar; las rutas, Lambdas y log groups se
eliminan. No hay datos que borrar (no se crean tablas ni ítems).
