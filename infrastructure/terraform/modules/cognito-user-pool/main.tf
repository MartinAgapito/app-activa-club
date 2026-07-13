# Cognito User Pool único con grupos member/admin (rol modelado como grupo,
# no hardcodeado) y un App Client para el SPA. Ver ADR-0002.
#
# El authorizer de API Gateway y las Lambdas de activación/registro que
# usarán este User Pool se agregan en Sprint 1 (US-009, módulo modules/endpoint),
# cuando exista el código real del backend.

locals {
  name_prefix = "${var.project}-${var.environment}"

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

resource "aws_cognito_user_pool" "this" {
  name = "${local.name_prefix}-users"

  # Login por correo+contraseña (RN-ACT-04); sin username separado.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  password_policy {
    minimum_length    = var.password_minimum_length
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
    require_uppercase = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  mfa_configuration = var.mfa_configuration

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-users" })
}

# App Client del SPA (apps/web). Sin secreto (cliente público en el navegador).
resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name_prefix}-web-client"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 1
  id_token_validity      = 1
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "hours"
    id_token      = "hours"
    refresh_token = "days"
  }
}

# Grupos = roles (ADR-0002). El claim cognito:groups viaja en el JWT y
# determina member/admin sin cambios de esquema al agregar administradores.
resource "aws_cognito_user_group" "member" {
  name         = "member"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Socios autenticados (rol member) — ver ADR-0002"
  precedence   = 10
}

resource "aws_cognito_user_group" "admin" {
  name         = "admin"
  user_pool_id = aws_cognito_user_pool.this.id
  description  = "Administradores (rol admin) — ver ADR-0002"
  precedence   = 1
}
