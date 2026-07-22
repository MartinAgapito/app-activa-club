# Bootstrap de la cuenta AWS de Activa Club.
#
# EXCEPCIÓN JUSTIFICADA (US-004, "casos alternativos"): este es el único
# módulo que se aplica de forma manual y puntual por una persona con
# permisos elevados, usando estado LOCAL (nunca remoto). Es la solución
# clásica al problema del huevo y la gallina: el backend S3+DynamoDB que
# usarán environments/dev y environments/demo para su propio estado remoto
# no puede vivir en el estado que aún no existe. Una vez aplicado aquí, sus
# outputs se copian a los bloques `backend "s3"` (comentados) de cada
# entorno y al secreto `AWS_OIDC_ROLE_ARN` de GitHub Actions.
#
# No se ejecuta `terraform apply` de este módulo como parte de US-004: se
# deja listo, validado (`terraform validate`) y documentado en
# docs/deployment/terraform-infraestructura.md, a la espera de una cuenta
# AWS designada para el proyecto.

terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
  }

  # Estado local intencional (ver cabecera de este archivo). No usar
  # backend "s3" aquí.
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      Component = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  common_tags = merge(
    {
      Project   = var.project
      Component = "bootstrap"
      ManagedBy = "terraform"
    },
    var.tags,
  )

  # Claims "sub" aceptados en el trust policy del rol OIDC: Pull Requests
  # (terraform plan) y push directo a main/master (alineado con
  # .github/workflows/pr-quality.yml). Ajustar si US-007 fija otra rama.
  allowed_subject_claims = [
    "repo:${var.github_org}/${var.github_repo}:pull_request",
    "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
    "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/master",
  ]
}

# ---------------------------------------------------------------------------
# Backend de estado remoto: bucket S3 (versionado, cifrado, sin acceso
# público) + tabla DynamoDB de lock. Ver docs/deployment/terraform-infraestructura.md.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name

  tags = merge(local.common_tags, { Name = var.state_bucket_name })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = var.state_lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = merge(local.common_tags, { Name = var.state_lock_table_name })

  lifecycle {
    prevent_destroy = true
  }
}

# ---------------------------------------------------------------------------
# Proveedor OIDC de GitHub Actions (recurso único por cuenta AWS).
# ---------------------------------------------------------------------------
data "tls_certificate" "github" {
  count = var.create_oidc_provider ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.github[0].certificates[0].sha1_fingerprint]

  tags = local.common_tags
}

locals {
  oidc_provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : var.existing_oidc_provider_arn
}

# ---------------------------------------------------------------------------
# Rol IAM asumible por GitHub Actions vía OIDC, para el job "terraform" del
# workflow de PR (.github/workflows/pr-quality.yml → secreto AWS_OIDC_ROLE_ARN).
# Alcance: SOLO LECTURA (equivalente a `terraform plan`), nunca `apply`. Los
# roles de escritura para los pipelines de despliegue a dev/demo (con
# aprobación manual para demo) se agregan en historias posteriores, cuando
# esos pipelines existan (ver docs/deployment/terraform-infraestructura.md).
# ---------------------------------------------------------------------------
data "aws_iam_policy_document" "github_actions_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.allowed_subject_claims
    }
  }
}

resource "aws_iam_role" "github_actions_plan" {
  name                 = "${var.project}-github-actions-plan"
  assume_role_policy   = data.aws_iam_policy_document.github_actions_trust.json
  max_session_duration = 3600

  tags = local.common_tags
}

# Política de solo lectura, acotada por prefijo de recurso donde el API de
# AWS lo permite (DynamoDB, S3). Varias acciones de solo lectura de Cognito,
# SES, CloudFront, IAM y CloudWatch Logs no admiten scoping por ARN de
# recurso en su API (limitación de AWS, no de esta política): se documenta
# aquí en vez de aparentar un scoping que la propia API no soporta.
data "aws_iam_policy_document" "github_actions_plan_permissions" {
  statement {
    sid    = "TerraformStateReadWrite"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/*",
    ]
  }

  statement {
    sid    = "TerraformStateLock"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    resources = [aws_dynamodb_table.terraform_locks.arn]
  }

  statement {
    sid    = "ReadProjectDynamoDbTables"
    effect = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:ListTagsOfResource",
    ]
    resources = [
      "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/${var.project}-*",
      "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/${var.project}-*/index/*",
    ]
  }

  # "s3:Get*" en vez de enumerar cada sub-configuracion (accelerate,
  # lifecycle, replication, etc.): el proveedor AWS de Terraform refresca
  # varias de estas al leer aws_s3_bucket y varias no siguen el patron
  # "GetBucket*" (p. ej. "GetAccelerateConfiguration",
  # "GetLifecycleConfiguration"). Sigue acotado a solo lectura y a los
  # buckets del proyecto por ARN.
  statement {
    sid    = "ReadProjectS3Buckets"
    effect = "Allow"
    actions = [
      "s3:Get*",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::${var.project}-*",
    ]
  }

  # Acciones de solo lectura que la API de AWS solo admite con Resource = "*"
  # (Cognito, SES, CloudFront, IAM, CloudWatch Logs, y "describe" genéricos
  # de DynamoDB/S3 a nivel de cuenta). Necesarias para que `terraform plan`
  # pueda leer el estado real de estos servicios sin otorgar ningún permiso
  # de escritura sobre ellos.
  statement {
    sid    = "ReadOnlyAccountWideServices"
    effect = "Allow"
    actions = [
      "cognito-idp:Describe*",
      "cognito-idp:Get*",
      "cognito-idp:List*",
      "ses:Get*",
      "ses:List*",
      "sesv2:Get*",
      "sesv2:List*",
      "cloudfront:Get*",
      "cloudfront:List*",
      "logs:Describe*",
      "logs:Get*",
      "logs:List*",
      "iam:Get*",
      "iam:List*",
      "dynamodb:Describe*",
      "dynamodb:List*",
      "s3:GetAccountPublicAccessBlock",
      "s3:ListAllMyBuckets",
      "tag:GetResources",
      # US-011: lectura de Lambda, API Gateway y alarmas de CloudWatch, para
      # que `terraform plan` pueda refrescar el estado de los endpoints
      # serverless de EP-02 (ninguna de estas APIs admite scoping por ARN de
      # recurso en sus acciones "describe"/"get"/"list").
      "lambda:GetFunction*",
      "lambda:GetPolicy",
      "lambda:GetAlias",
      "lambda:List*",
      "apigateway:GET",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetMetricData",
      "cloudwatch:ListTagsForResource",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "CallerIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_plan" {
  name   = "${var.project}-github-actions-plan-readonly"
  role   = aws_iam_role.github_actions_plan.id
  policy = data.aws_iam_policy_document.github_actions_plan_permissions.json
}

# ---------------------------------------------------------------------------
# Rol IAM asumible por GitHub Actions vía OIDC, para el job de despliegue
# real a **dev** (deploy-dev.yml → secreto AWS_DEPLOY_DEV_ROLE_ARN). A
# diferencia de github_actions_plan (solo lectura, PR + push a main/master),
# este rol hace `terraform apply` de verdad y sincroniza el frontend a S3, por
# lo que:
#
# - El trust policy SOLO acepta el claim `sub` de un push directo a la rama
#   `main` (nunca `pull_request`): un PR, por más que agregue commits, jamás
#   puede obtener credenciales de este rol. Esto es intencional y es la
#   principal defensa contra un PR malicioso que intente ejecutar apply.
# - Se acota únicamente a `main` (no también `master`, a diferencia del rol de
#   plan): este pipeline es nuevo, no arrastra la ambigüedad de rama pre-US-007
#   que sí afecta a pr-quality.yml.
# - El alcance de escritura se limita a los recursos de un único entorno
#   (`dev`): funciones Lambda, sus roles de ejecución, API Gateway, la tabla
#   DynamoDB y los log groups/alarmas de `dev`, más el bucket del frontend y
#   la distribución CloudFront de `dev` (para el paso de sync + invalidación
#   del pipeline). Nunca toca recursos de `demo` (ver
#   github_actions_deploy_demo más abajo, historia posterior).
# - Los recursos base de dev ya existentes (tabla DynamoDB, Cognito, buckets,
#   CloudFront, SES) fueron aplicados manualmente antes de que existiera este
#   rol (ver docs/deployment/terraform-infraestructura.md); este rol solo
#   necesita permisos de escritura sobre ellos donde el propio `terraform
#   apply` pueda tocarlos en el futuro (Lambda/API Gateway, que sí cambian en
#   cada despliegue de backend) — no se le dan permisos de escritura sobre
#   Cognito/S3 base/CloudFront/SES que hoy son estables y se gestionan aparte,
#   siguiendo el principio de mínimo privilegio.
# ---------------------------------------------------------------------------
locals {
  deploy_dev_allowed_subject_claims = [
    "repo:${var.github_org}/${var.github_repo}:ref:refs/heads/main",
  ]

  # Prefijo de nombres de recursos de dev (ver modules/endpoint,
  # modules/frontend-hosting): "${var.project}-dev".
  dev_name_prefix = "${var.project}-dev"
}

data "aws_iam_policy_document" "github_actions_deploy_dev_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.deploy_dev_allowed_subject_claims
    }
  }
}

resource "aws_iam_role" "github_actions_deploy_dev" {
  name                 = "${var.project}-github-actions-deploy-dev"
  assume_role_policy   = data.aws_iam_policy_document.github_actions_deploy_dev_trust.json
  max_session_duration = 3600

  tags = local.common_tags
}

data "aws_iam_policy_document" "github_actions_deploy_dev_permissions" {
  statement {
    sid    = "TerraformStateReadWriteDev"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    # Acotado al prefijo "dev/" del bucket de estado compartido (la key del
    # backend de environments/dev es "dev/terraform.tfstate"): este rol no
    # puede leer ni escribir el estado de "demo/terraform.tfstate".
    resources = [
      aws_s3_bucket.terraform_state.arn,
      "${aws_s3_bucket.terraform_state.arn}/dev/*",
    ]
  }

  statement {
    sid    = "TerraformStateLockDev"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
    ]
    # La tabla de locks es compartida entre dev y demo (igual que en
    # github_actions_plan); DynamoDB no admite acotar por LockID de forma
    # segura en este statement sin arriesgar romper el locking real si el
    # formato interno de LockID cambiara entre versiones de Terraform, así
    # que se mantiene el mismo alcance (tabla completa) que el rol de plan.
    resources = [aws_dynamodb_table.terraform_locks.arn]
  }

  statement {
    sid    = "ManageDevDynamoDbTable"
    effect = "Allow"
    actions = [
      "dynamodb:DescribeTable",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:ListTagsOfResource",
      "dynamodb:CreateTable",
      "dynamodb:UpdateTable",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
      # Sin dynamodb:DeleteTable: defensa adicional contra destrucción
      # accidental de datos de socios, más allá de prevent_destroy en el
      # propio recurso Terraform (modules/dynamodb-table).
    ]
    resources = [
      "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/${local.dev_name_prefix}",
      "arn:aws:dynamodb:*:${data.aws_caller_identity.current.account_id}:table/${local.dev_name_prefix}/index/*",
    ]
  }

  statement {
    sid    = "ManageDevLambdaFunctions"
    effect = "Allow"
    actions = [
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetPolicy",
      "lambda:ListVersionsByFunction",
      "lambda:ListTags",
      "lambda:CreateFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:DeleteFunction",
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
    ]
    resources = [
      "arn:aws:lambda:*:${data.aws_caller_identity.current.account_id}:function:${local.dev_name_prefix}-*",
    ]
  }

  # Roles de ejecución de Lambda (uno por función, modules/endpoint:
  # "${function_full_name}-role"). Sin iam:DeleteRole ni permisos sobre
  # ningún otro rol de la cuenta (p. ej. los de bootstrap o los de demo).
  statement {
    sid    = "ManageDevLambdaExecutionRoles"
    effect = "Allow"
    actions = [
      "iam:GetRole",
      "iam:CreateRole",
      "iam:DeleteRole",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
    ]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.dev_name_prefix}-*",
    ]
  }

  # iam:PassRole: imprescindible para que Lambda pueda asumir el rol de
  # ejecución que este mismo rol acaba de crear/actualizar. Acotado al mismo
  # patrón de nombre Y al servicio que puede recibirlo (defensa en
  # profundidad: aunque alguien lograra inyectar un ARN de rol con ese
  # prefijo, solo podría pasarlo al servicio Lambda, nunca a otro).
  statement {
    sid       = "PassDevLambdaExecutionRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.dev_name_prefix}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # API Gateway (plano de control): la API AWS no permite acotar por ID de
  # API REST concreto en su ARN de gestión (limitación de la propia API, no
  # de esta política) — mismo patrón "/restapis"+"/restapis/*" documentado
  # por AWS para políticas de administración de API Gateway.
  statement {
    sid    = "ManageDevApiGateway"
    effect = "Allow"
    actions = [
      "apigateway:GET",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:PATCH",
      "apigateway:DELETE",
    ]
    resources = [
      "arn:aws:apigateway:*::/restapis",
      "arn:aws:apigateway:*::/restapis/*",
    ]
  }

  # Log groups de cada Lambda (modules/log-group, "/aws/lambda/<function>").
  # Se listan ambas formas de ARN (con y sin ":*" final) porque distintas
  # acciones de CloudWatch Logs exigen una u otra forma en el Resource de la
  # política (particularidad documentada de la API de CloudWatch Logs).
  statement {
    sid    = "ManageDevLambdaLogGroups"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:PutRetentionPolicy",
      "logs:TagResource",
      "logs:DescribeLogGroups",
      "logs:ListTagsForResource",
    ]
    resources = [
      "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.dev_name_prefix}-*",
      "arn:aws:logs:*:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.dev_name_prefix}-*:*",
    ]
  }

  # Alarma de errores por función (modules/endpoint, "<function>-errors").
  statement {
    sid    = "ManageDevLambdaErrorAlarms"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricAlarm",
      "cloudwatch:DeleteAlarms",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:TagResource",
    ]
    resources = [
      "arn:aws:cloudwatch:*:${data.aws_caller_identity.current.account_id}:alarm:${local.dev_name_prefix}-*",
    ]
  }

  # Lectura de mínimo privilegio necesaria para que `terraform apply` pueda
  # refrescar en el mismo plan los recursos base de dev (Cognito, SES,
  # CloudFront, buckets S3) que este rol NO puede escribir (ver cabecera):
  # si esos recursos no cambiaron, plan/apply solo necesita leerlos. Ninguna
  # de estas acciones admite scoping por ARN de recurso en su API (misma
  # limitación ya documentada en github_actions_plan_permissions).
  statement {
    sid    = "ReadOnlyDevAccountWideServices"
    effect = "Allow"
    actions = [
      "cognito-idp:Describe*",
      "cognito-idp:Get*",
      "cognito-idp:List*",
      "ses:Get*",
      "ses:List*",
      "sesv2:Get*",
      "sesv2:List*",
      "cloudfront:Get*",
      "cloudfront:List*",
      "iam:Get*",
      "iam:List*",
      "s3:GetAccountPublicAccessBlock",
      "s3:ListAllMyBuckets",
      "tag:GetResources",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ReadProjectS3BucketsDev"
    effect = "Allow"
    actions = [
      "s3:Get*",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::${local.dev_name_prefix}-*",
    ]
  }

  # Sincronización del build del frontend (apps/web) al bucket privado de
  # hosting (modules/frontend-hosting), paso "aws s3 sync" del pipeline de
  # deploy-dev. Terraform no gestiona objetos individuales de S3: este
  # statement es exclusivamente para ese paso, no para `terraform apply`.
  statement {
    sid    = "DeployFrontendAssetsDev"
    effect = "Allow"
    actions = [
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
    ]
    resources = [
      "arn:aws:s3:::${local.dev_name_prefix}-web",
      "arn:aws:s3:::${local.dev_name_prefix}-web/*",
    ]
  }

  # Invalidación de caché de CloudFront tras cada sync del frontend. Acotado
  # además por tags (Project/Environment, ver default_tags de cada
  # provider "aws" de entorno) ya que el ARN de una distribución no permite
  # fijar de antemano su ID en esta política (se crea recién al aplicar
  # modules/frontend-hosting).
  statement {
    sid       = "InvalidateDevFrontendCache"
    effect    = "Allow"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = ["arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/*"]

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Project"
      values   = [var.project]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Environment"
      values   = ["dev"]
    }
  }

  statement {
    sid       = "CallerIdentityDeployDev"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_deploy_dev" {
  name   = "${var.project}-github-actions-deploy-dev"
  role   = aws_iam_role.github_actions_deploy_dev.id
  policy = data.aws_iam_policy_document.github_actions_deploy_dev_permissions.json
}
