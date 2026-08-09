# Entorno dev — Activa Club.
#
# Solo recursos base (US-004): tabla DynamoDB, Cognito, buckets S3, hosting
# del SPA, identidad SES. Lambdas/API Gateway (módulo modules/endpoint) se
# agregan en Sprint 1 cuando exista el código real del backend (apps/api).

module "dynamodb_table" {
  source = "../../modules/dynamodb-table"

  project     = var.project
  environment = var.environment
}

module "cognito" {
  source = "../../modules/cognito-user-pool"

  project     = var.project
  environment = var.environment
}

module "storage" {
  source = "../../modules/s3-storage"

  project     = var.project
  environment = var.environment
}

module "frontend_hosting" {
  source = "../../modules/frontend-hosting"

  project     = var.project
  environment = var.environment

  # CloudFront rutea /api/* al API Gateway de este entorno bajo el mismo
  # dominio que sirve el SPA (fix P0-1: sin esto no hay CORS en ninguna
  # capa). aws_api_gateway_rest_api.this y el stage_name (= var.environment)
  # se declaran más abajo en este mismo archivo; Terraform arma el grafo de
  # dependencias igual, sin importar el orden de aparición.
  api_origin_domain_name = "${aws_api_gateway_rest_api.this.id}.execute-api.${var.aws_region}.amazonaws.com"
  api_origin_path        = "/${var.environment}"
}

module "ses" {
  source = "../../modules/ses-identity"

  project      = var.project
  environment  = var.environment
  sender_email = var.ses_sender_email
}

# Requerida por local.ssm_default_kms_decrypt_conditions (permiso IAM de
# kms:Decrypt acotado por cuenta, ver módulos endpoint_payments_create /
# endpoint_payments_webhook, US-019); ningún otro recurso la usa hoy.
data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Endpoints de identidad y acceso (EP-02, US-011): API Gateway REST + una
# Lambda por endpoint (ADR-0004), autorizadas con el Cognito Authorizer y el
# claim `cognito:groups` (ADR-0002). Cada endpoint pasa
# source_zip_path = local.lambda_zip_path["<function_name>"] (ver locals más
# abajo): si var.lambda_artifacts_dir está definido (el job de despliegue a
# dev lo hace tras correr `node scripts/package-lambdas.mjs`), despliega el
# handler real de apps/api; si no (PRs, `terraform plan`/`validate` locales),
# cae de vuelta al stub temporal de modules/endpoint (HTTP 501).
#
# El árbol de rutas (aws_api_gateway_resource) se declara una única vez aquí
# porque varios endpoints comparten segmentos (p. ej. "members"); cada
# module "endpoint_*" solo agrega su método + integración + Lambda sobre el
# nodo ya creado (ver modules/endpoint/README.md).
#
# Todo el árbol cuelga de un único recurso raíz "api" (aws_api_gateway_resource
# "api_root" más abajo), no de la raíz de la API REST: docs/api/contratos-api.md
# §1 documenta el prefijo /api en la base URL, y CloudFront (module
# "frontend_hosting" más arriba) reenvía "/api/..." tal cual al origen de API
# Gateway anteponiendo solo el stage ("/dev" + "/api/..."). Si este árbol
# colgara de la raíz en vez de "api", la ruta que arma CloudFront no
# encontraría el recurso real (duplicaría o le faltaría el segmento "api").
# ---------------------------------------------------------------------------

locals {
  # Referencias cortas a outputs de los módulos base (US-004), reutilizadas
  # por los permisos IAM de mínimo privilegio de cada endpoint.
  dynamodb_table_arn  = module.dynamodb_table.table_arn
  dynamodb_table_name = module.dynamodb_table.table_name
  dynamodb_index_arn  = "${module.dynamodb_table.table_arn}/index/*"

  cognito_user_pool_arn = module.cognito.user_pool_arn
  cognito_user_pool_id  = module.cognito.user_pool_id

  migration_bucket_arn  = module.storage.migration_bucket_arn
  migration_bucket_name = module.storage.migration_bucket_name

  # kms:Decrypt sobre la llave administrada por defecto de SSM
  # ("alias/aws/ssm", ver aws_ssm_parameter.culqi_private_key más abajo) no
  # admite un ARN de recurso concreto y estable en esta política: el ARN
  # real de esa llave lo crea AWS de forma perezosa (la primera vez que se
  # usa un SecureString sin especificar una llave propia) y referenciarlo
  # con un data source de KMS en el mismo plan que crea el parámetro
  # formaría una dependencia circular. Se acota en su lugar por condición
  # (US-019, ver modules/endpoint/README.md): solo si la llamada a KMS pasa
  # a través del servicio SSM (nunca una llamada directa a KMS) y solo
  # dentro de esta cuenta AWS.
  ssm_default_kms_decrypt_conditions = [
    {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.aws_region}.amazonaws.com"]
    },
    {
      test     = "StringEquals"
      variable = "kms:CallerAccount"
      values   = [data.aws_caller_identity.current.account_id]
    },
  ]

  # Árbol de rutas de la API (docs/api/contratos-api.md §3, §4, §10), separado
  # por nivel de profundidad: Terraform no permite que una instancia de
  # aws_api_gateway_resource.this[x] dependa de otra instancia del mismo
  # recurso (formaría un ciclo), así que cada nivel de anidamiento se declara
  # en un recurso `for_each` distinto que depende únicamente del nivel
  # anterior.
  # "memberships" y "payments": EP-03/US-019 (docs/api/contratos-api.md §5).
  api_resource_level1 = ["activation", "registration", "members", "admin", "memberships", "payments"]

  api_resource_level2 = {
    "activation/verify"   = { parent = "activation", part = "verify" }
    "activation/complete" = { parent = "activation", part = "complete" }
    "members/me"          = { parent = "members", part = "me" }
    "members/{memberId}"  = { parent = "members", part = "{memberId}" }
    "admin/migration"     = { parent = "admin", part = "migration" }
    # POST /payments y GET /payments (US-019) cuelgan directo del nodo
    # level1 "payments" (igual que POST/GET /members con "members"), sin
    # nodo level2 propio: solo "payments/webhook" y "payments/{paymentId}"
    # necesitan un segmento adicional.
    "memberships/plans"    = { parent = "memberships", part = "plans" }
    "payments/webhook"     = { parent = "payments", part = "webhook" }
    "payments/{paymentId}" = { parent = "payments", part = "{paymentId}" }
  }

  api_resource_level3 = {
    "members/{memberId}/approve" = { parent = "members/{memberId}", part = "approve" }
    "members/{memberId}/reject"  = { parent = "members/{memberId}", part = "reject" }
    "admin/migration/run"        = { parent = "admin/migration", part = "run" }
    # PATCH /members/me/auto-renew (US-019, docs/api/contratos-api.md §4).
    "members/me/auto-renew" = { parent = "members/me", part = "auto-renew" }
  }

  # Mapa combinado ruta completa -> ID de aws_api_gateway_resource, para que
  # cada module "endpoint_*" resuelva su parent_resource_id por nombre de
  # ruta (docs/api/contratos-api.md) en vez de por nivel.
  api_resource_id = merge(
    { for k, v in aws_api_gateway_resource.level1 : k => v.id },
    { for k, v in aws_api_gateway_resource.level2 : k => v.id },
    { for k, v in aws_api_gateway_resource.level3 : k => v.id },
  )

  # Artefacto real por función (US-009 backend + este pipeline de deploy-dev):
  # "function_name" -> "<lambda_artifacts_dir>/function_name.zip", generado
  # por `node scripts/package-lambdas.mjs`. Si var.lambda_artifacts_dir es
  # null, el mapa completo resuelve a null y cada module "endpoint_*" cae de
  # vuelta al stub temporal (ver variables.tf), sin romper `terraform
  # plan`/`validate` en PRs ni en ejecuciones locales sin artefactos.
  lambda_zip_path = {
    for function_name in [
      "activation-verify",
      "activation-complete",
      "registration",
      "members-get-me",
      "members-update-me",
      "members-list",
      "members-get-by-id",
      "members-approve",
      "members-reject",
      "admin-migration-run",
      # EP-03, US-019 (docs/api/contratos-api.md §5, §4).
      "memberships-plans",
      "payments-create",
      "payments-list",
      "payments-get-by-id",
      "payments-webhook",
      "members-update-auto-renew",
      ] : function_name => (
      var.lambda_artifacts_dir == null ? null : "${var.lambda_artifacts_dir}/${function_name}.zip"
    )
  }

  # Topología completa del árbol de recursos (id + padre + nombre de cada
  # nodo): aws_api_gateway_resource permite reasignar el "parent_id" de un
  # recurso sin cambiarle su id (Terraform lo actualiza en el lugar, no lo
  # reemplaza), así que un cambio de jerarquía de rutas (p. ej. mover todo
  # bajo "api/") no altera ningún method_id/integration_id existente. Sin
  # esto en el trigger de abajo, ese tipo de cambio no fuerza un nuevo
  # despliegue del stage y la API queda sirviendo rutas viejas en silencio
  # (bug real detectado tras el fix de CORS de PR #31: el stage siguió
  # apuntando a un deployment de antes de que "/api/*" existiera).
  api_resource_topology = concat(
    ["${aws_api_gateway_resource.api_root.id}:${aws_api_gateway_resource.api_root.parent_id}:${aws_api_gateway_resource.api_root.path_part}"],
    [for r in aws_api_gateway_resource.level1 : "${r.id}:${r.parent_id}:${r.path_part}"],
    [for r in aws_api_gateway_resource.level2 : "${r.id}:${r.parent_id}:${r.path_part}"],
    [for r in aws_api_gateway_resource.level3 : "${r.id}:${r.parent_id}:${r.path_part}"],
  )

  # IDs de método/integración de todos los endpoints, usados como trigger de
  # redeploy del stage (cualquier cambio en un endpoint fuerza un nuevo
  # despliegue de la API).
  api_method_trigger_ids = [
    module.endpoint_activation_verify.method_id,
    module.endpoint_activation_verify.integration_id,
    module.endpoint_activation_complete.method_id,
    module.endpoint_activation_complete.integration_id,
    module.endpoint_registration.method_id,
    module.endpoint_registration.integration_id,
    module.endpoint_members_get_me.method_id,
    module.endpoint_members_get_me.integration_id,
    module.endpoint_members_update_me.method_id,
    module.endpoint_members_update_me.integration_id,
    module.endpoint_members_list.method_id,
    module.endpoint_members_list.integration_id,
    module.endpoint_members_get_by_id.method_id,
    module.endpoint_members_get_by_id.integration_id,
    module.endpoint_members_approve.method_id,
    module.endpoint_members_approve.integration_id,
    module.endpoint_members_reject.method_id,
    module.endpoint_members_reject.integration_id,
    module.endpoint_admin_migration_run.method_id,
    module.endpoint_admin_migration_run.integration_id,
    module.endpoint_memberships_plans.method_id,
    module.endpoint_memberships_plans.integration_id,
    module.endpoint_payments_create.method_id,
    module.endpoint_payments_create.integration_id,
    module.endpoint_payments_list.method_id,
    module.endpoint_payments_list.integration_id,
    module.endpoint_payments_get_by_id.method_id,
    module.endpoint_payments_get_by_id.integration_id,
    module.endpoint_payments_webhook.method_id,
    module.endpoint_payments_webhook.integration_id,
    module.endpoint_members_update_auto_renew.method_id,
    module.endpoint_members_update_auto_renew.integration_id,
  ]
}

resource "aws_api_gateway_rest_api" "this" {
  name        = "${var.project}-${var.environment}-api"
  description = "API REST de Activa Club (${var.environment}) - endpoints de identidad y acceso (EP-02, US-011)."

  endpoint_configuration {
    types = ["REGIONAL"] # Evita el costo/latencia de un despliegue edge-optimized innecesario para el MVP.
  }
}

# Autorizador Cognito (ADR-0002): valida el JWT en el borde; el rol viaja en
# el claim `cognito:groups` y cada handler lo revisa con requireRole().
resource "aws_api_gateway_authorizer" "cognito" {
  name            = "${var.project}-${var.environment}-cognito-authorizer"
  rest_api_id     = aws_api_gateway_rest_api.this.id
  type            = "COGNITO_USER_POOLS"
  provider_arns   = [local.cognito_user_pool_arn]
  identity_source = "method.request.header.Authorization"
}

# Segmento "api" (docs/api/contratos-api.md §1: base URL con prefijo /api),
# único hijo directo de la raíz de la API REST. Todo el resto del árbol
# (level1/level2/level3) cuelga de este nodo, no de root_resource_id.
resource "aws_api_gateway_resource" "api_root" {
  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
  path_part   = "api"
}

resource "aws_api_gateway_resource" "level1" {
  for_each = toset(local.api_resource_level1)

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.api_root.id
  path_part   = each.value
}

resource "aws_api_gateway_resource" "level2" {
  for_each = local.api_resource_level2

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.level1[each.value.parent].id
  path_part   = each.value.part
}

resource "aws_api_gateway_resource" "level3" {
  for_each = local.api_resource_level3

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_resource.level2[each.value.parent].id
  path_part   = each.value.part
}

# ---------------------------------------------------------------------------
# Secreto de la llave privada de Culqi sandbox (EP-03, US-019, RN-PAG-08,
# ADR-0007): SSM Parameter Store SecureString en vez de Secrets Manager.
# Elección: para un único valor de configuración sensible, sin rotación
# automática gestionada por AWS ni versiones concurrentes que consultar
# (Secrets Manager brilla ahí, pero cuesta ~US$0.40/mes por secreto +
# llamadas de API; SSM SecureString no tiene costo fijo, encripta con la
# llave administrada por defecto de la cuenta ("alias/aws/ssm", sin costo
# adicional de KMS) y alcanza sobre para leer un valor server-side desde una
# Lambda). Respeta el criterio de "presupuesto Free Tier" (criterio de
# aceptación 11).
#
# No hay todavía cuenta real de Culqi sandbox (decisión tomada con el
# usuario): el valor es un placeholder explícito, nunca una llave real ni un
# secreto de verdad, así que no figura ningún dato sensible en este repo
# (criterio de aceptación 3). `lifecycle.ignore_changes` sobre "value" es
# intencional: una vez que alguien cargue el valor real a mano (`aws ssm
# put-parameter --overwrite`, ver docs/deployment/despliegue-dev.md), un
# futuro `terraform apply` no debe volver a pisarlo con el placeholder.
resource "aws_ssm_parameter" "culqi_private_key" {
  name        = "/${var.project}/${var.environment}/culqi/private-key"
  description = "Llave privada de Culqi sandbox (server-side, RN-PAG-04/08). Placeholder hasta contar con una cuenta Culqi sandbox real; ver docs/deployment/despliegue-dev.md para cargar el valor real y rotarlo."
  type        = "SecureString"
  value       = "PENDIENTE_CULQI_SANDBOX_KEY"

  tags = {
    Name = "${var.project}-${var.environment}-culqi-private-key"
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# Secreto de verificación de firma del webhook de Culqi (US-024, criterio 2;
# ADR-0007). **Distinto** de `aws_ssm_parameter.culqi_private_key`: ese
# secreto sirve para cobrar (llave privada, US-019); este solo sirve para
# validar que una notificación entrante de `POST /payments/webhook`
# realmente la envió Culqi (HMAC del cuerpo crudo, ver
# `apps/api/src/payments/webhook-signature.ts`), nunca para cobrar. Mismo
# patrón que el parámetro de arriba: SecureString con la llave administrada
# por defecto de la cuenta, sin costo fijo de KMS.
#
# Tampoco hay todavía cuenta real de Culqi sandbox: mismo placeholder
# explícito y el mismo `lifecycle.ignore_changes` para no pisar un valor real
# cargado a mano en un futuro `terraform apply`.
resource "aws_ssm_parameter" "culqi_webhook_secret" {
  name        = "/${var.project}/${var.environment}/culqi/webhook-secret"
  description = "Secreto compartido para verificar la firma del webhook de Culqi (RN-PAG-07/08, US-024). Placeholder hasta contar con una cuenta Culqi sandbox real; ver docs/deployment/despliegue-dev.md para cargar el valor real y rotarlo."
  type        = "SecureString"
  value       = "PENDIENTE_CULQI_SANDBOX_KEY"

  tags = {
    Name = "${var.project}-${var.environment}-culqi-webhook-secret"
  }

  lifecycle {
    ignore_changes = [value]
  }
}

# --- Activación y registro (docs/api/contratos-api.md §3) — Público -------

module "endpoint_activation_verify" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "activation-verify"
  source_zip_path = local.lambda_zip_path["activation-verify"]
  http_method     = "POST"
  resource_path   = "api/activation/verify"
  requires_auth   = false

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["activation/verify"]

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_activation_complete" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "activation-complete"
  source_zip_path = local.lambda_zip_path["activation-complete"]
  http_method     = "POST"
  resource_path   = "api/activation/complete"
  requires_auth   = false

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["activation/complete"]

  environment_variables = {
    DYNAMODB_TABLE_NAME  = local.dynamodb_table_name
    COGNITO_USER_POOL_ID = local.cognito_user_pool_id
  }

  iam_policy_statements = [
    {
      # dynamodb:PutItem/UpdateItem + dynamodb:TransactWriteItems: enlazar la
      # cuenta digital al socio migrado escribe, en una sola transacción, el
      # ítem UniqueEmail (nuevo, el socio migrado no tenía uno) y actualiza el
      # Member ya existente (nunca un PutItem nuevo). AWS exige el permiso de
      # la acción de item concreta (Put/Update) además de TransactWriteItems
      # para cada operación dentro de la transacción (detectado al escribir
      # este flujo, igual que el ajuste ya hecho para US-016/registro).
      actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:TransactWriteItems"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
    {
      actions   = ["cognito-idp:AdminCreateUser", "cognito-idp:AdminAddUserToGroup", "cognito-idp:AdminSetUserPassword"]
      resources = [local.cognito_user_pool_arn]
    },
  ]
}

module "endpoint_registration" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "registration"
  source_zip_path = local.lambda_zip_path["registration"]
  http_method     = "POST"
  resource_path   = "api/registration"
  requires_auth   = false

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["registration"]

  environment_variables = {
    DYNAMODB_TABLE_NAME  = local.dynamodb_table_name
    COGNITO_USER_POOL_ID = local.cognito_user_pool_id
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query", "dynamodb:PutItem", "dynamodb:TransactWriteItems"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
    {
      # AdminSetUserPassword: la contraseña elegida por el socio se confirma
      # como definitiva (Permanent: true) para que pueda loguearse de
      # inmediato con US-014, sin el reto NEW_PASSWORD_REQUIRED que deja
      # AdminCreateUser por sí solo.
      actions = [
        "cognito-idp:AdminCreateUser",
        "cognito-idp:AdminSetUserPassword",
        "cognito-idp:AdminAddUserToGroup",
      ]
      resources = [local.cognito_user_pool_arn]
    },
  ]
}

# --- Socios (docs/api/contratos-api.md §4) ---------------------------------

module "endpoint_members_get_me" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-get-me"
  source_zip_path = local.lambda_zip_path["members-get-me"]
  http_method     = "GET"
  resource_path   = "api/members/me"
  requires_auth   = true
  allowed_groups  = ["member"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/me"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_members_update_me" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-update-me"
  source_zip_path = local.lambda_zip_path["members-update-me"]
  http_method     = "PATCH"
  resource_path   = "api/members/me"
  requires_auth   = true
  allowed_groups  = ["member"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/me"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query", "dynamodb:UpdateItem"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_members_list" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-list"
  source_zip_path = local.lambda_zip_path["members-list"]
  http_method     = "GET"
  resource_path   = "api/members"
  requires_auth   = true
  allowed_groups  = ["admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_members_get_by_id" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-get-by-id"
  source_zip_path = local.lambda_zip_path["members-get-by-id"]
  http_method     = "GET"
  resource_path   = "api/members/{memberId}"
  requires_auth   = true
  allowed_groups  = ["admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/{memberId}"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:GetItem"]
      resources = [local.dynamodb_table_arn]
    },
  ]
}

module "endpoint_members_approve" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-approve"
  source_zip_path = local.lambda_zip_path["members-approve"]
  http_method     = "POST"
  resource_path   = "api/members/{memberId}/approve"
  requires_auth   = true
  allowed_groups  = ["admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/{memberId}/approve"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
      resources = [local.dynamodb_table_arn]
    },
    {
      # PutItem: registra el AuditLog "MEMBER_APPROVED" (US-017, ADR-0008)
      # tras la transición PENDING -> APPROVED.
      actions   = ["dynamodb:PutItem"]
      resources = [local.dynamodb_table_arn]
    },
  ]
}

module "endpoint_members_reject" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-reject"
  source_zip_path = local.lambda_zip_path["members-reject"]
  http_method     = "POST"
  resource_path   = "api/members/{memberId}/reject"
  requires_auth   = true
  allowed_groups  = ["admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/{memberId}/reject"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
      resources = [local.dynamodb_table_arn]
    },
    {
      # PutItem: registra el AuditLog "MEMBER_REJECTED" (US-017, ADR-0008)
      # tras la transición PENDING -> REJECTED, con el motivo en `metadata`.
      actions   = ["dynamodb:PutItem"]
      resources = [local.dynamodb_table_arn]
    },
  ]
}

# --- Administración operativa (docs/api/contratos-api.md §10) -------------

module "endpoint_admin_migration_run" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "admin-migration-run"
  source_zip_path = local.lambda_zip_path["admin-migration-run"]
  http_method     = "POST"
  resource_path   = "api/admin/migration/run"
  requires_auth   = true
  allowed_groups  = ["admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["admin/migration/run"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  # Timeout más alto: la migración procesa el JSON completo del bucket S3 en
  # una sola invocación síncrona (RN-MIG, docs/data/mapeo-migracion.md §5).
  timeout = 60

  environment_variables = {
    DYNAMODB_TABLE_NAME   = local.dynamodb_table_name
    MIGRATION_BUCKET_NAME = local.migration_bucket_name
  }

  iam_policy_statements = [
    {
      actions   = ["s3:GetObject"]
      resources = ["${local.migration_bucket_arn}/*"]
    },
    {
      actions   = ["dynamodb:PutItem", "dynamodb:TransactWriteItems"]
      resources = [local.dynamodb_table_arn]
    },
  ]
}

# --- Membresías y pagos (docs/api/contratos-api.md §5) — EP-03, US-019 ----
#
# Sin lógica de negocio (US-021/US-024/US-025 la implementan): todas estas
# Lambdas despliegan el stub temporal de modules/endpoint hasta que
# lambda_zip_path["<function_name>"] resuelva un artefacto real. El permiso
# IAM de mínimo privilegio ya se otorga ahora para que esas historias de
# backend no dependan de un cambio de infraestructura adicional.

module "endpoint_memberships_plans" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "memberships-plans"
  source_zip_path = local.lambda_zip_path["memberships-plans"]
  http_method     = "GET"
  resource_path   = "api/memberships/plans"
  requires_auth   = true
  allowed_groups  = ["member", "admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["memberships/plans"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  # Sin permisos adicionales: los planes son valores mock/parametrizables
  # devueltos por la propia Lambda (docs/api/contratos-api.md §5), sin
  # lectura de DynamoDB en el alcance de esta historia.
}

module "endpoint_payments_create" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "payments-create"
  source_zip_path = local.lambda_zip_path["payments-create"]
  http_method     = "POST"
  resource_path   = "api/payments"
  requires_auth   = true
  allowed_groups  = ["member"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["payments"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME          = local.dynamodb_table_name
    CULQI_PRIVATE_KEY_PARAM_NAME = aws_ssm_parameter.culqi_private_key.name
  }

  iam_policy_statements = [
    {
      # PaymentIdempotency (PutItem condicional) + Payment (PutItem) +
      # Membership/Member (UpdateItem) en una única transacción (ADR-0007,
      # RT-01): mismo patrón de Put/Update explícitos + TransactWriteItems
      # ya usado por activation-complete/registration. dynamodb:Query es
      # imprescindible: `findMemberByCognitoSub` resuelve el socio
      # autenticado por GSI1 (apps/api/src/members/repository.ts) antes de
      # cualquier otra operación, y `reserveIdempotencyKey` relee el ítem
      # previo por Query cuando la condición de unicidad falla
      # (apps/api/src/payments/idempotency.ts). Sin este permiso, la Lambda
      # fallaba con AccessDeniedException en el primer acceso a datos de
      # *cualquier* solicitud, que `toErrorResult()` normaliza a un genérico
      # 500 INTERNAL_ERROR (encontrado en verificación en vivo de US-026).
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:TransactWriteItems"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
    {
      # Lectura de la llave privada de Culqi (criterio de aceptación 4):
      # acotado al único parámetro que esta Lambda necesita.
      actions   = ["ssm:GetParameter"]
      resources = [aws_ssm_parameter.culqi_private_key.arn]
    },
    {
      # Descifrado del SecureString (ver comentario de
      # local.ssm_default_kms_decrypt_conditions más arriba: la llave
      # "alias/aws/ssm" no tiene un ARN de recurso concreto conocible acá).
      actions    = ["kms:Decrypt"]
      resources  = ["*"]
      conditions = local.ssm_default_kms_decrypt_conditions
    },
  ]
}

module "endpoint_payments_list" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "payments-list"
  source_zip_path = local.lambda_zip_path["payments-list"]
  http_method     = "GET"
  resource_path   = "api/payments"
  requires_auth   = true
  allowed_groups  = ["member", "admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["payments"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      # Historial propio (Query PK=MEMBER#<id>) o analytics por estado
      # (Query GSI2PK=PAYMENT#STATUS#<status>, docs/data/modelo-dynamodb.md
      # §3.5), según el rol del solicitante.
      actions   = ["dynamodb:Query"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_payments_get_by_id" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "payments-get-by-id"
  source_zip_path = local.lambda_zip_path["payments-get-by-id"]
  http_method     = "GET"
  resource_path   = "api/payments/{paymentId}"
  requires_auth   = true
  allowed_groups  = ["member", "admin"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["payments/{paymentId}"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      # GetItem (si el handler conoce memberId+paymentId) o Query (si
      # necesita resolverlo por índice): el PK real de Payment es
      # MEMBER#<memberId> (docs/data/modelo-dynamodb.md §3.5).
      actions   = ["dynamodb:GetItem", "dynamodb:Query"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

module "endpoint_payments_webhook" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "payments-webhook"
  source_zip_path = local.lambda_zip_path["payments-webhook"]
  http_method     = "POST"
  resource_path   = "api/payments/webhook"
  # Público (docs/api/contratos-api.md §5, ADR-0007): la verificación de
  # firma de Culqi la implementa US-024 dentro del handler, no el Cognito
  # Authorizer. requires_auth = false ya es soportado tal cual por
  # modules/endpoint (mismo mecanismo que /activation/* y /registration
  # más arriba); no hizo falta ningún ajuste al módulo para esto.
  requires_auth = false

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["payments/webhook"]

  environment_variables = {
    DYNAMODB_TABLE_NAME             = local.dynamodb_table_name
    CULQI_WEBHOOK_SECRET_PARAM_NAME = aws_ssm_parameter.culqi_webhook_secret.name
  }

  iam_policy_statements = [
    {
      # Confirmación idempotente del pago + actualización de membresía
      # (ADR-0007): converge con POST /payments sin duplicar el cargo.
      # dynamodb:Query cubre además la localización del Payment por
      # paymentId sobre GSI2 (US-024, apps/api/src/payments/repository.ts,
      # findPaymentByPaymentId): el webhook solo conoce el paymentId que este
      # backend envió como referencia al crear el cargo, no el memberId.
      actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:TransactWriteItems"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
    {
      # Secreto de verificación de firma (US-024, criterio 2), distinto de la
      # llave privada de cobro (`aws_ssm_parameter.culqi_private_key`, usada
      # solo por payments-create): este endpoint nunca cobra, solo confirma.
      actions   = ["ssm:GetParameter"]
      resources = [aws_ssm_parameter.culqi_webhook_secret.arn]
    },
    {
      actions    = ["kms:Decrypt"]
      resources  = ["*"]
      conditions = local.ssm_default_kms_decrypt_conditions
    },
  ]
}

# --- Socios: auto-renovación (docs/api/contratos-api.md §4) — US-019 ------

module "endpoint_members_update_auto_renew" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name   = "members-update-auto-renew"
  source_zip_path = local.lambda_zip_path["members-update-auto-renew"]
  http_method     = "PATCH"
  resource_path   = "api/members/me/auto-renew"
  requires_auth   = true
  allowed_groups  = ["member"]

  rest_api_id            = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id     = local.api_resource_id["members/me/auto-renew"]
  cognito_authorizer_id  = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = local.dynamodb_table_name
  }

  iam_policy_statements = [
    {
      # Mismo patrón que members-update-me: Query (resolver el socio por
      # cognitoSub, GSI1) + UpdateItem (RN-PAG-03).
      actions   = ["dynamodb:Query", "dynamodb:UpdateItem"]
      resources = [local.dynamodb_table_arn, local.dynamodb_index_arn]
    },
  ]
}

# --- Deployment + stage -----------------------------------------------------

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode(concat(
      local.api_method_trigger_ids,
      local.api_resource_topology,
    )))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "this" {
  rest_api_id   = aws_api_gateway_rest_api.this.id
  deployment_id = aws_api_gateway_deployment.this.id
  stage_name    = var.environment

  tags = { Name = "${var.project}-${var.environment}-api-stage" }
}
