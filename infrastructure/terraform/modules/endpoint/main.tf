# Lambda por endpoint + método de API Gateway + permisos IAM de mínimo
# privilegio + log group + alarma (ADR-0004, ADR-0008, US-011).
#
# Sin lógica de negocio: si var.source_zip_path no se especifica, se
# despliega un stub temporal que responde 501 (criterio de aceptación 8 de
# US-011). Las historias de backend (US-012, US-013, US-016, US-017, US-018)
# reemplazan el stub apuntando source_zip_path al artefacto real de apps/api,
# sin tocar el resto de este módulo.

terraform {
  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }
}

locals {
  name_prefix        = "${var.project}-${var.environment}"
  function_full_name = "${local.name_prefix}-${var.function_name}"
  effective_handler  = coalesce(var.handler, "index.handler")
  using_stub         = var.source_zip_path == null
  effective_zip_path = local.using_stub ? data.archive_file.stub[0].output_path : var.source_zip_path
  effective_zip_hash = local.using_stub ? data.archive_file.stub[0].output_base64sha256 : filebase64sha256(var.source_zip_path)
  path_parameter_names = [
    for match in regexall("\\{([a-zA-Z0-9_]+)\\}", var.resource_path) : match[0]
  ]
  method_request_parameters = {
    for name in local.path_parameter_names : "method.request.path.${name}" => true
  }

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      # Los tags de AWS no admiten "{" ni "}" (regex de validacion de la API):
      # se despojan de los path parameters (p. ej. "members/{memberId}" ->
      # "members/memberId") en vez de perder la ruta completa del tag.
      Endpoint = "${var.http_method} /${replace(var.resource_path, "/[{}]/", "")}"
    },
    var.tags,
  )
}

# ---------------------------------------------------------------------------
# Stub temporal (sin lógica de negocio): responde 501 con el formato de error
# estándar del contrato (docs/api/contratos-api.md §1.1). Se regenera solo
# cuando cambia var.function_name; queda fuera de control de versiones (ver
# .gitignore, carpeta .build/) al ser un artefacto de build local.
# ---------------------------------------------------------------------------
data "archive_file" "stub" {
  count       = local.using_stub ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.build/${var.function_name}-stub.zip"

  source {
    filename = "index.js"
    content  = <<-JS
      // Stub temporal generado por Terraform (modules/endpoint, US-011).
      // Sin lógica de negocio: responde 501 con el formato de error estándar
      // (docs/api/contratos-api.md §1.1). Reemplazado por la Lambda real de
      // la historia de backend correspondiente a este endpoint.
      exports.handler = async (event) => {
        const requestId = event?.requestContext?.requestId ?? "stub";
        return {
          statusCode: 501,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: {
              code: "INTERNAL_ERROR",
              message: "Endpoint aun no implementado (infraestructura US-011, logica pendiente).",
              details: [],
              requestId,
            },
          }),
        };
      };
    JS
  }
}

# ---------------------------------------------------------------------------
# Rol de ejecución + permisos de mínimo privilegio.
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name = "${local.function_full_name}-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
        Action    = "sts:AssumeRole"
      },
    ]
  })

  tags = local.common_tags
}

module "log_group" {
  source = "../log-group"

  name              = "/aws/lambda/${local.function_full_name}"
  retention_in_days = var.log_retention_in_days
  tags              = local.common_tags
}

# Permiso mínimo indispensable: escribir en su propio log group (ADR-0008).
resource "aws_iam_role_policy" "logs" {
  name = "${local.function_full_name}-logs"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${module.log_group.arn}:*"
      },
    ]
  })
}

# Permisos adicionales de mínimo privilegio declarados por el llamante
# (p. ej. DynamoDB/Cognito/S3 acotados a los ARN que ese endpoint necesita).
resource "aws_iam_role_policy" "custom" {
  count = length(var.iam_policy_statements) > 0 ? 1 : 0

  name = "${local.function_full_name}-custom"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      for statement in var.iam_policy_statements : {
        Effect   = "Allow"
        Action   = statement.actions
        Resource = statement.resources
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# Función Lambda.
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "this" {
  function_name = local.function_full_name
  role          = aws_iam_role.lambda_exec.arn
  handler       = local.effective_handler
  runtime       = var.runtime
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = local.effective_zip_path
  source_code_hash = local.effective_zip_hash

  environment {
    variables = var.environment_variables
  }

  tags = merge(local.common_tags, { Name = local.function_full_name })

  depends_on = [aws_iam_role_policy.logs, module.log_group]
}

# ---------------------------------------------------------------------------
# Método + integración de API Gateway. El recurso (aws_api_gateway_resource)
# ya existe: lo crea una única vez el entorno llamante para poder compartir
# segmentos de ruta (p. ej. "members") entre varios endpoints sin colisión.
# ---------------------------------------------------------------------------
resource "aws_api_gateway_method" "this" {
  rest_api_id   = var.rest_api_id
  resource_id   = var.parent_resource_id
  http_method   = var.http_method
  authorization = var.requires_auth ? "COGNITO_USER_POOLS" : "NONE"
  authorizer_id = var.requires_auth ? var.cognito_authorizer_id : null

  request_parameters = local.method_request_parameters
}

resource "aws_api_gateway_integration" "this" {
  rest_api_id             = var.rest_api_id
  resource_id             = var.parent_resource_id
  http_method             = aws_api_gateway_method.this.http_method
  type                    = "AWS_PROXY"
  integration_http_method = "POST" # Fijo: Lambda proxy siempre invoca vía POST, independientemente del verbo público.
  uri                     = aws_lambda_function.this.invoke_arn
}

# Permiso de invocación acotado al método/ruta de este endpoint (mínimo
# privilegio: ninguna otra ruta de la API puede invocar esta Lambda).
resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.rest_api_execution_arn}/*/${var.http_method}/${var.resource_path}"
}

# ---------------------------------------------------------------------------
# Alarma mínima por función (ADR-0008): tasa de errores de la Lambda. Sin
# acciones (sin SNS) para no incurrir en costo adicional; visible en la
# consola de CloudWatch para diagnóstico durante la demo.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "errors" {
  count = var.enable_error_alarm ? 1 : 0

  alarm_name          = "${local.function_full_name}-errors"
  alarm_description   = "Errores de la funcion ${local.function_full_name} (ADR-0008)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  statistic           = "Sum"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  period              = 300
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.this.function_name
  }

  tags = local.common_tags
}
