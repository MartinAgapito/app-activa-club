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

variable "password_minimum_length" {
  description = "Longitud mínima de contraseña exigida por el User Pool."
  type        = number
  default     = 8
}

variable "mfa_configuration" {
  description = "Configuración de MFA del User Pool. \"OFF\" para el MVP (no requerido por las reglas de negocio)."
  type        = string
  default     = "OFF"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration debe ser OFF, OPTIONAL u ON."
  }
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}
