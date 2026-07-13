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

  statement {
    sid    = "ReadProjectS3Buckets"
    effect = "Allow"
    actions = [
      "s3:GetBucket*",
      "s3:ListBucket",
      "s3:GetEncryptionConfiguration",
      "s3:GetBucketPolicy",
      "s3:GetBucketTagging",
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
