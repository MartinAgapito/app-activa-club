variable "project" {
  description = "Nombre corto del proyecto, usado como prefijo de nombres de recursos."
  type        = string
  default     = "activa-club"
}

variable "environment" {
  description = "Entorno. Fijo para esta raíz (ver ADR-0001)."
  type        = string
  default     = "prd"

  validation {
    condition     = var.environment == "prd"
    error_message = "Esta raíz de Terraform es exclusiva del entorno prd."
  }
}

variable "aws_region" {
  description = "Región AWS del entorno prd."
  type        = string
  default     = "us-east-1"
}

variable "ses_sender_email" {
  description = <<-EOT
    Correo remitente de SES a verificar para prd (ADR-0006). Sin valor por
    defecto: suministrar vía terraform.tfvars (no versionado) o TF_VAR_ses_sender_email.
    Ver terraform.tfvars.example.
  EOT
  type        = string
}
