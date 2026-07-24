variable "project" {
  description = "Nombre corto del proyecto, usado como prefijo de nombres de recursos."
  type        = string
  default     = "activa-club"
}

variable "environment" {
  description = "Entorno (dev | prd). Ver ADR-0001."
  type        = string

  validation {
    condition     = contains(["dev", "prd"], var.environment)
    error_message = "environment debe ser \"dev\" o \"prd\" (ADR-0001)."
  }
}

variable "sender_email" {
  description = <<-EOT
    Dirección de correo remitente a verificar en SES para este entorno
    (ADR-0006). No tiene valor por defecto: debe suministrarse por
    terraform.tfvars (no versionado) o variable de CI, nunca hardcodeada
    en el repositorio. En sandbox de SES, además del remitente, cada
    destinatario de prueba también debe verificarse manualmente en la
    consola de SES (limitación del sandbox, no de Terraform).
  EOT
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.sender_email))
    error_message = "sender_email debe ser una dirección de correo con formato válido."
  }
}
