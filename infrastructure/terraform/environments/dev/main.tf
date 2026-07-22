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
}

module "ses" {
  source = "../../modules/ses-identity"

  project      = var.project
  environment  = var.environment
  sender_email = var.ses_sender_email
}

# ---------------------------------------------------------------------------
# Endpoints de identidad y acceso (EP-02, US-011): API Gateway REST + una
# Lambda por endpoint (ADR-0004), autorizadas con el Cognito Authorizer y el
# claim `cognito:groups` (ADR-0002). Sin lógica de negocio: cada Lambda
# despliega el stub temporal de modules/endpoint (HTTP 501) hasta que la
# historia de backend correspondiente reemplace su source_zip_path.
#
# El árbol de rutas (aws_api_gateway_resource) se declara una única vez aquí
# porque varios endpoints comparten segmentos (p. ej. "members"); cada
# module "endpoint_*" solo agrega su método + integración + Lambda sobre el
# nodo ya creado (ver modules/endpoint/README.md).
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

  # Árbol de rutas de la API (docs/api/contratos-api.md §3, §4, §10), separado
  # por nivel de profundidad: Terraform no permite que una instancia de
  # aws_api_gateway_resource.this[x] dependa de otra instancia del mismo
  # recurso (formaría un ciclo), así que cada nivel de anidamiento se declara
  # en un recurso `for_each` distinto que depende únicamente del nivel
  # anterior.
  api_resource_level1 = ["activation", "registration", "members", "admin"]

  api_resource_level2 = {
    "activation/verify"   = { parent = "activation", part = "verify" }
    "activation/complete" = { parent = "activation", part = "complete" }
    "members/me"          = { parent = "members", part = "me" }
    "members/{memberId}"  = { parent = "members", part = "{memberId}" }
    "admin/migration"     = { parent = "admin", part = "migration" }
  }

  api_resource_level3 = {
    "members/{memberId}/approve" = { parent = "members/{memberId}", part = "approve" }
    "members/{memberId}/reject"  = { parent = "members/{memberId}", part = "reject" }
    "admin/migration/run"        = { parent = "admin/migration", part = "run" }
  }

  # Mapa combinado ruta completa -> ID de aws_api_gateway_resource, para que
  # cada module "endpoint_*" resuelva su parent_resource_id por nombre de
  # ruta (docs/api/contratos-api.md) en vez de por nivel.
  api_resource_id = merge(
    { for k, v in aws_api_gateway_resource.level1 : k => v.id },
    { for k, v in aws_api_gateway_resource.level2 : k => v.id },
    { for k, v in aws_api_gateway_resource.level3 : k => v.id },
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

resource "aws_api_gateway_resource" "level1" {
  for_each = toset(local.api_resource_level1)

  rest_api_id = aws_api_gateway_rest_api.this.id
  parent_id   = aws_api_gateway_rest_api.this.root_resource_id
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

# --- Activación y registro (docs/api/contratos-api.md §3) — Público -------

module "endpoint_activation_verify" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name = "activation-verify"
  http_method   = "POST"
  resource_path = "activation/verify"
  requires_auth = false

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

  function_name = "activation-complete"
  http_method   = "POST"
  resource_path = "activation/complete"
  requires_auth = false

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

  function_name = "registration"
  http_method   = "POST"
  resource_path = "registration"
  requires_auth = false

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

  function_name  = "members-get-me"
  http_method    = "GET"
  resource_path  = "members/me"
  requires_auth  = true
  allowed_groups = ["member"]

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

  function_name  = "members-update-me"
  http_method    = "PATCH"
  resource_path  = "members/me"
  requires_auth  = true
  allowed_groups = ["member"]

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

  function_name  = "members-list"
  http_method    = "GET"
  resource_path  = "members"
  requires_auth  = true
  allowed_groups = ["admin"]

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

  function_name  = "members-get-by-id"
  http_method    = "GET"
  resource_path  = "members/{memberId}"
  requires_auth  = true
  allowed_groups = ["admin"]

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

  function_name  = "members-approve"
  http_method    = "POST"
  resource_path  = "members/{memberId}/approve"
  requires_auth  = true
  allowed_groups = ["admin"]

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

  function_name  = "members-reject"
  http_method    = "POST"
  resource_path  = "members/{memberId}/reject"
  requires_auth  = true
  allowed_groups = ["admin"]

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

  function_name  = "admin-migration-run"
  http_method    = "POST"
  resource_path  = "admin/migration/run"
  requires_auth  = true
  allowed_groups = ["admin"]

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

# --- Deployment + stage -----------------------------------------------------

resource "aws_api_gateway_deployment" "this" {
  rest_api_id = aws_api_gateway_rest_api.this.id

  triggers = {
    redeployment = sha1(jsonencode(local.api_method_trigger_ids))
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
