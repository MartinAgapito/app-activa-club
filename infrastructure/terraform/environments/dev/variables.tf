variable "project" {
  description = "Nombre corto del proyecto, usado como prefijo de nombres de recursos."
  type        = string
  default     = "activa-club"
}

variable "environment" {
  description = "Entorno. Fijo para esta raíz (ver ADR-0001)."
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "Esta raíz de Terraform es exclusiva del entorno dev."
  }
}

variable "aws_region" {
  description = "Región AWS del entorno dev."
  type        = string
  default     = "us-east-1"
}

variable "ses_sender_email" {
  description = <<-EOT
    Correo remitente de SES a verificar para dev (ADR-0006). Sin valor por
    defecto: suministrar vía terraform.tfvars (no versionado) o TF_VAR_ses_sender_email.
    Ver terraform.tfvars.example.
  EOT
  type        = string
}

variable "lambda_artifacts_dir" {
  description = <<-EOT
    Ruta absoluta al directorio con los .zip reales de cada Lambda, generados
    por `node scripts/package-lambdas.mjs` (function_name.zip por endpoint).
    Si es null (valor por defecto), cada endpoint despliega el stub temporal
    de modules/endpoint (HTTP 501): es el comportamiento de siempre para
    `terraform plan`/`validate` en CI/local sin haber corrido el
    empaquetado. El job de despliegue a dev (deploy-dev.yml) sí lo define,
    apuntando al directorio que generó ese mismo job.
  EOT
  type        = string
  default     = null
}
