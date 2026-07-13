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
    └── demo/               # raíz de Terraform del entorno demo
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
  tocar el estado de `demo` (evita el escenario de romper la demo del jurado
  por un error de contexto).
- **Variables por entorno explícitas y auditable en PR** (`terraform.tfvars`
  por carpeta) en vez de variables condicionadas por el nombre del workspace
  activo.
- Costo de mantenimiento aceptable: solo dos entornos (`dev`, `demo`, ver
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
     `environments/dev/providers.tf` y `environments/demo/providers.tf`
     (descomentar y completar).
   - El secreto de repositorio `AWS_OIDC_ROLE_ARN` (ya referenciado por
     `.github/workflows/pr-quality.yml`, ver US-005).
5. En cada entorno: `terraform init -migrate-state` para mover el estado
   local existente (si lo hubiera) al backend S3.

## 3. Entornos

Dos entornos, según [ADR-0001](../architecture/adr/ADR-0001-estrategia-entornos.md):

| Entorno | Carpeta | Propósito |
|---|---|---|
| `dev` | `environments/dev/` | Trabajo diario, despliegues frecuentes |
| `demo` | `environments/demo/` | Presentación al jurado, desplegado desde rama principal validada |

Ambos comparten los mismos módulos; solo cambian variables (`environment`,
`ses_sender_email`, y potencialmente `aws_region`/cuenta si en el futuro se
separan cuentas AWS).

## 4. Recursos base declarados (módulos)

| Módulo | Recursos | Referencia |
|---|---|---|
| `modules/dynamodb-table` | Tabla única `activa-club-<env>`, GSI1/GSI2/GSI3, TTL `expiresAt`, PITR, cifrado, `prevent_destroy` | [modelo-dynamodb.md](../data/modelo-dynamodb.md), [ADR-0003](../architecture/adr/ADR-0003-dynamodb-single-table.md) |
| `modules/cognito-user-pool` | User Pool, App Client web, grupos `member`/`admin` | [ADR-0002](../architecture/adr/ADR-0002-autenticacion-cognito-roles.md) |
| `modules/s3-storage` | Bucket de migración (versionado) + bucket de activos, privados y cifrados | [ADR-0005](../architecture/adr/ADR-0005-s3-migracion-activos-hosting.md) |
| `modules/frontend-hosting` | Bucket web privado + CloudFront + Origin Access Control | [ADR-0005](../architecture/adr/ADR-0005-s3-migracion-activos-hosting.md) |
| `modules/ses-identity` | Identidad de correo remitente verificada por entorno | [ADR-0006](../architecture/adr/ADR-0006-ses-correos-transaccionales.md) |
| `modules/log-group` | CloudWatch Log Group genérico y reutilizable (retención parametrizable, default 14 días) | [ADR-0008](../architecture/adr/ADR-0008-observabilidad-logging-auditoria.md) |
| `modules/endpoint` | **Placeholder sin recursos** (Lambda + ruta API Gateway + Cognito Authorizer + rol IAM + log group), interfaz de variables lista para Sprint 1 | [ADR-0004](../architecture/adr/ADR-0004-api-gateway-rest-lambda-por-endpoint.md) |
| `infrastructure/terraform/bootstrap` | Backend de estado (S3+DynamoDB), proveedor OIDC de GitHub, rol IAM de solo lectura para CI | Este documento, sección 2 |

**No se declaran** todavía: funciones Lambda, API Gateway, alarmas de
CloudWatch específicas por endpoint, plantillas SES, ni el permiso
`ses:SendEmail`/`dynamodb:*` de cada Lambda — todo eso depende del código
real de `apps/api` (Sprint 1, US-009) y se agrega completando
`modules/endpoint` (ver su `README.md`).

## 5. Variables y secretos requeridos por entorno

| Variable | Dónde se define | Tipo | Notas |
|---|---|---|---|
| `ses_sender_email` | `environments/<env>/terraform.tfvars` (no versionado) o `TF_VAR_ses_sender_email` | No secreta, pero específica del entorno | Ver `terraform.tfvars.example` en cada entorno |
| `AWS_OIDC_ROLE_ARN` | Secreto de repositorio GitHub | Secreto | Rol de solo lectura de `bootstrap` (output `github_actions_plan_role_arn`) |
| `AWS_REGION` | Variable de repositorio GitHub (opcional) | No secreta | Default `us-east-1` si no se define (ver `pr-quality.yml`) |
| `github_org`, `github_repo` | `bootstrap/terraform.tfvars` (no versionado) | No secretas | Solo para aplicar `bootstrap` manualmente |

Ningún archivo `terraform.tfvars` real se versiona (`.gitignore` ya excluye
`*.tfvars` y permite `*.tfvars.example`). Ninguna clave AWS estática se usa
en ningún punto (OIDC exclusivamente, ver sección 6).

## 6. Autenticación OIDC de GitHub Actions

- `bootstrap` crea el proveedor OIDC (`token.actions.githubusercontent.com`)
  y un único rol, `activa-club-github-actions-plan`, de **solo lectura**
  (equivalente a `terraform plan`; sin permisos de escritura/`apply`).
- El trust policy del rol restringe el `sub` del token a este repositorio
  exacto, para `pull_request` y `push` a `main`/`master` (alineado con los
  disparadores de `pr-quality.yml`).
- Los roles de **escritura** (aplicar cambios reales en `dev`, y en `demo`
  con aprobación manual) son trabajo de historias posteriores de
  despliegue (dev deploy / demo deploy), cuando esos pipelines existan; no
  se crean en US-004 para no habilitar un `apply` automatizado antes de
  tener funcionalidad real que desplegar.

## 7. Aplicación manual controlada (procedimiento, cuando exista cuenta AWS)

1. **Nunca** desde el equipo local con credenciales personales para cambios
   que afecten `demo`: usar siempre el pipeline de CI con revisión humana
   una vez exista (dev deploy / demo deploy).
2. Para `dev` en esta etapa (Sprint 0, sin pipeline de despliegue aún):
   ```bash
   cd infrastructure/terraform/environments/dev
   terraform init
   terraform plan -out=tfplan
   # Revisar el plan línea por línea antes de aplicar.
   terraform apply tfplan
   ```
3. Para `demo`: mismo procedimiento, pero solo tras validar en `dev` y con
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
cd ../demo && terraform init -backend=false && terraform validate
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
`Environment = "dev"|"demo"` y `ManagedBy = "terraform"` (vía `default_tags`
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
