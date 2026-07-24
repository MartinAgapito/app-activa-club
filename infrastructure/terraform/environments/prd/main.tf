# Entorno prd — Activa Club (presentación al jurado).
#
# Solo recursos base (US-004): tabla DynamoDB, Cognito, buckets S3, hosting
# del SPA, identidad SES. Lambdas/API Gateway (módulo modules/endpoint) se
# agregan en Sprint 1 cuando exista el código real del backend (apps/api).
# El despliegue a prd requerirá además aprobación manual en el pipeline
# de despliegue final (ver docs/deployment/terraform-infraestructura.md).

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

# Sprint 1 (US-009): instanciar aquí un module "..." { source = "../../modules/endpoint" ... }
# por cada endpoint de docs/api/contratos-api.md, más los log groups
# (modules/log-group) y alarmas asociadas (ADR-0008).
