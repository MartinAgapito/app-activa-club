# Hosting del SPA (apps/web): bucket S3 privado + CloudFront con Origin
# Access Control (OAC). Ver ADR-0005.
#
# Este módulo NO despliega el build del frontend (eso es del pipeline de
# despliegue, US-005/Sprint 1+): solo prepara el bucket y la distribución.

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

  # Proxy /api/* -> API Gateway (fix P0-1, ver variables.tf). Ambas variables
  # se exigen juntas: si falta alguna, no se agrega el origen (evita un
  # behavior sin origen_path/domain válido).
  has_api_origin = var.api_origin_domain_name != null && var.api_origin_path != null
  api_origin_id  = "api-gateway"
}

resource "aws_s3_bucket" "web" {
  bucket = "${local.name_prefix}-web"

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-web" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket = aws_s3_bucket.web.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${local.name_prefix}-web-oac"
  description                       = "OAC para el bucket privado del SPA de Activa Club (${var.environment})"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# Fallback de SPA (React Router) sin depender de custom_error_response: ver
# spa-fallback.js. Asociada solo al default_cache_behavior (S3), nunca a
# "/api/*", para no enmascarar los 403/404 legítimos de la API.
resource "aws_cloudfront_function" "spa_fallback" {
  name    = "${local.name_prefix}-spa-fallback"
  runtime = "cloudfront-js-2.0"
  comment = "Reescribe rutas sin extension a /index.html para el SPA (${var.environment})"
  publish = true
  code    = file("${path.module}/spa-fallback.js")
}

# Cache policy administrada por AWS (evita el atributo forwarded_values,
# obsoleto en el provider AWS actual).
data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

# Policies administradas por AWS para el behavior /api/* (sin caché de
# respuestas de la API, reenviando headers/cookies/query strings salvo Host).
data "aws_cloudfront_cache_policy" "caching_disabled" {
  count = local.has_api_origin ? 1 : 0
  name  = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  count = local.has_api_origin ? 1 : 0
  name  = "Managed-AllViewerExceptHostHeader"
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  default_root_object = "index.html"
  price_class         = var.price_class
  comment             = "${local.name_prefix}-web"

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "s3-web"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  # Origen del API Gateway de este entorno (fix P0-1): solo se agrega cuando
  # el llamante pasa var.api_origin_domain_name/var.api_origin_path.
  dynamic "origin" {
    for_each = local.has_api_origin ? [1] : []
    content {
      domain_name = var.api_origin_domain_name
      origin_id   = local.api_origin_id
      origin_path = var.api_origin_path

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-web"
    viewer_protocol_policy = "redirect-to-https"
    cache_policy_id        = data.aws_cloudfront_cache_policy.caching_optimized.id
    compress               = true

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.spa_fallback.arn
    }
  }

  # /api/* -> API Gateway, sin caché (TTL 0 vía Managed-CachingDisabled) y
  # reenviando headers/cookies/query strings (Authorization incluido) salvo
  # Host, para no romper la firma de la request en el origen.
  dynamic "ordered_cache_behavior" {
    for_each = local.has_api_origin ? [1] : []
    content {
      path_pattern             = "/api/*"
      target_origin_id         = local.api_origin_id
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled[0].id
      origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header[0].id
      compress                 = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # Sin dominio propio en el MVP: certificado por defecto de CloudFront.
  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = merge(local.common_tags, { Name = "${local.name_prefix}-web" })
}

# Solo CloudFront (vía OAC) puede leer del bucket; el bucket permanece privado.
resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.web.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.web.arn
          }
        }
      }
    ]
  })
}
