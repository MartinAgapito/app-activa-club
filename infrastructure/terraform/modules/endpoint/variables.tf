# Interfaz preparada para Sprint 1 (ver README.md de este módulo). Ningún
# recurso se declara todavía en main.tf: estas variables documentan el
# contrato que usará modules/endpoint una vez exista el código real de
# apps/api (ADR-0004).

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

variable "function_name" {
  description = "Nombre corto de la función/endpoint (p. ej. \"reservations-create\"), tal como se documenta en docs/api/contratos-api.md."
  type        = string
  default     = null
}

variable "handler" {
  description = "Handler de la función Lambda (p. ej. index.handler)."
  type        = string
  default     = null
}

variable "runtime" {
  description = "Runtime de Lambda."
  type        = string
  default     = "nodejs20.x"
}

variable "memory_size" {
  description = "Memoria asignada a la función (MB)."
  type        = number
  default     = 256
}

variable "timeout" {
  description = "Timeout de la función (segundos)."
  type        = number
  default     = 10
}

variable "source_zip_path" {
  description = "Ruta al artefacto empaquetado (.zip) de la función, generado por el build de apps/api."
  type        = string
  default     = null
}

variable "http_method" {
  description = "Verbo HTTP del endpoint (GET, POST, PATCH, DELETE, ...)."
  type        = string
  default     = null
}

variable "resource_path" {
  description = "Ruta REST del endpoint, relativa a la raíz de la API (p. ej. \"reservations\" o \"members/{id}/approve\")."
  type        = string
  default     = null
}

variable "requires_auth" {
  description = "Si el endpoint requiere Cognito Authorizer (JWT válido). Casi todos los endpoints lo requieren salvo activación/registro inicial."
  type        = bool
  default     = true
}

variable "allowed_groups" {
  description = "Grupos de Cognito autorizados a invocar el endpoint (p. ej. [\"admin\"]). Lista vacía = cualquier usuario autenticado."
  type        = list(string)
  default     = []
}

variable "environment_variables" {
  description = "Variables de entorno de la función (p. ej. nombre de tabla DynamoDB)."
  type        = map(string)
  default     = {}
}

variable "iam_policy_statements" {
  description = "Declaraciones IAM de mínimo privilegio adicionales que necesita esta función específica (acciones + recursos)."
  type = list(object({
    actions   = list(string)
    resources = list(string)
  }))
  default = []
}

variable "log_retention_in_days" {
  description = "Retención del log group de esta función (ADR-0008)."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}
