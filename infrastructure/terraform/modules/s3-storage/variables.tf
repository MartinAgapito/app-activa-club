variable "project" {
  description = "Nombre corto del proyecto, usado como prefijo de nombres de recursos."
  type        = string
  default     = "activa-club"
}

variable "environment" {
  description = "Entorno (dev | demo). Ver ADR-0001."
  type        = string

  validation {
    condition     = contains(["dev", "demo"], var.environment)
    error_message = "environment debe ser \"dev\" o \"demo\" (ADR-0001)."
  }
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}
