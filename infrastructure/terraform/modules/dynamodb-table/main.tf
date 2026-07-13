# Tabla única DynamoDB de Activa Club.
#
# Fuente de verdad del esquema: docs/data/modelo-dynamodb.md (sección 1).
# Cualquier cambio de atributos/índices debe reflejarse primero ahí.
# Justificación de diseño: ADR-0003 (single-table).

locals {
  name_prefix = "${var.project}-${var.environment}"
  table_name  = local.name_prefix

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    },
    var.tags,
  )
}

resource "aws_dynamodb_table" "this" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST" # on-demand, ver modelo-dynamodb.md
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  attribute {
    name = "GSI1PK"
    type = "S"
  }

  attribute {
    name = "GSI1SK"
    type = "S"
  }

  attribute {
    name = "GSI2PK"
    type = "S"
  }

  attribute {
    name = "GSI2SK"
    type = "S"
  }

  attribute {
    name = "GSI3PK"
    type = "S"
  }

  attribute {
    name = "GSI3SK"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "GSI1PK"
    range_key       = "GSI1SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI2"
    hash_key        = "GSI2PK"
    range_key       = "GSI2SK"
    projection_type = "ALL"
  }

  global_secondary_index {
    name            = "GSI3"
    hash_key        = "GSI3PK"
    range_key       = "GSI3SK"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = var.enable_point_in_time_recovery
  }

  # Cifrado en reposo con clave gestionada por AWS (sin costo adicional).
  server_side_encryption {
    enabled = true
  }

  tags = merge(local.common_tags, { Name = local.table_name })

  # Salvaguarda contra `terraform destroy`/cambios que recreen la tabla por
  # error (perdería todos los datos operativos). Si en algún momento se
  # necesita destruir deliberadamente la tabla de un entorno (p. ej. reset
  # completo de dev), quitar este bloque temporalmente, aplicar, y luego
  # restaurarlo.
  lifecycle {
    prevent_destroy = true
  }
}
