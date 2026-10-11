# Lambda programada (EventBridge cron), o de invocación directa si no se define
# schedule_expression, con IAM de mínimo privilegio, log group
# con retención y una alarma de errores (ADR-0004, ADR-0008, US-038).
#
# Sin recursos siempre encendidos: Lambda + regla de EventBridge se facturan
# por invocación (una al día), dentro de la capa gratuita.

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
  has_schedule       = var.schedule_expression != null
  using_stub         = var.source_zip_path == null
  effective_zip_path = local.using_stub ? data.archive_file.stub[0].output_path : var.source_zip_path
  effective_zip_hash = local.using_stub ? data.archive_file.stub[0].output_base64sha256 : filebase64sha256(var.source_zip_path)

  common_tags = merge(
    {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
      Job         = var.function_name
    },
    var.tags,
  )
}

# Stub temporal para `terraform plan`/`validate` sin artefactos: falla de
# forma explícita para que nunca parezca que el proceso corrió.
data "archive_file" "stub" {
  count       = local.using_stub ? 1 : 0
  type        = "zip"
  output_path = "${path.module}/.build/${var.function_name}-stub.zip"

  source {
    filename = "index.js"
    content  = <<-JS
      // Stub generado por Terraform (modules/scheduled-job): sin lógica real.
      exports.handler = async () => {
        throw new Error("Proceso programado sin artefacto real desplegado (stub de modules/scheduled-job).");
      };
    JS
  }
}

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

resource "aws_lambda_function" "this" {
  function_name = local.function_full_name
  description   = var.description
  role          = aws_iam_role.lambda_exec.arn
  handler       = var.handler
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
# Programación: regla de EventBridge -> Lambda. Con schedule_expression = null
# (Lambda de invocación directa, p. ej. la carga inicial de socios, ADR-0012)
# no se crea ni regla, ni target, ni permiso de EventBridge.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_event_rule" "schedule" {
  count = local.has_schedule ? 1 : 0

  name                = "${local.function_full_name}-schedule"
  description         = var.description
  schedule_expression = var.schedule_expression
  state               = var.schedule_enabled ? "ENABLED" : "DISABLED"

  tags = local.common_tags
}

resource "aws_cloudwatch_event_target" "lambda" {
  count = local.has_schedule ? 1 : 0

  rule = aws_cloudwatch_event_rule.schedule[0].name
  arn  = aws_lambda_function.this.arn
}

# Solo esta regla puede invocar la función (mínimo privilegio).
resource "aws_lambda_permission" "eventbridge" {
  count = local.has_schedule ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.schedule[0].arn
}

# ---------------------------------------------------------------------------
# Alarma de errores (ADR-0008, US-038 criterio 10). Sin acciones (sin SNS)
# para no incurrir en costo; visible en la consola de CloudWatch.
# ---------------------------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "errors" {
  count = var.enable_error_alarm ? 1 : 0

  alarm_name          = "${local.function_full_name}-errors"
  alarm_description   = "Fallo del proceso programado ${local.function_full_name} (ADR-0008)."
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

# Los recursos de programación pasaron a `count` (ADR-0012): estos bloques
# evitan que Terraform destruya y recree la regla/target/permiso ya
# desplegados de memberships-expire (el plan debe salir sin cambios).
moved {
  from = aws_cloudwatch_event_rule.schedule
  to   = aws_cloudwatch_event_rule.schedule[0]
}

moved {
  from = aws_cloudwatch_event_target.lambda
  to   = aws_cloudwatch_event_target.lambda[0]
}

moved {
  from = aws_lambda_permission.eventbridge
  to   = aws_lambda_permission.eventbridge[0]
}
