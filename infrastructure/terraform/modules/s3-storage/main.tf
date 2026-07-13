# Buckets de migración y activos. Ver ADR-0005.
#
# El bucket de hosting del SPA (web + CloudFront) vive en el módulo separado
# modules/frontend-hosting (distinta superficie de seguridad, ADR-0005).

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

# ---------------------------------------------------------------------------
# Bucket de migración: JSON mock on-premise (RN-MIG-01). Privado, versionado,
# cifrado. Solo la Lambda de migración (Sprint 1) tendrá permiso de lectura.
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "migration" {
  bucket = "${local.name_prefix}-migration"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-migration" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "migration" {
  bucket = aws_s3_bucket.migration.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "migration" {
  bucket = aws_s3_bucket.migration.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "migration" {
  bucket = aws_s3_bucket.migration.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ---------------------------------------------------------------------------
# Bucket de activos del sistema. Privado, cifrado; acceso vía URLs prefirmadas
# o CloudFront según necesidad futura (ADR-0005).
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "assets" {
  bucket = "${local.name_prefix}-assets"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-assets" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
