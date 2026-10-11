# Interfaz de modules/scheduled-job (US-038, Sprint 4): Lambda invocada por
# una regla de EventBridge con cron + permisos IAM de mínimo privilegio + log
# group + alarma de errores (ADR-0004, ADR-0008). Hermano de modules/endpoint
# para funciones que no son HTTP (sin API Gateway ni Cognito).

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

variable "function_name" {
  description = "Nombre corto del proceso (p. ej. \"memberships-expire\")."
  type        = string
}

variable "description" {
  description = "Descripción corta del proceso, usada en la función y la regla de EventBridge."
  type        = string
}

variable "handler" {
  description = "Handler de la función Lambda (el bundle de scripts/package-lambdas.mjs expone index.handler)."
  type        = string
  default     = "index.handler"
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
  description = "Timeout de la función (segundos). Un proceso batch necesita más margen que un endpoint HTTP."
  type        = number
  default     = 300
}

variable "source_zip_path" {
  description = <<-EOT
    Ruta al artefacto empaquetado (.zip) de la función (scripts/package-lambdas.mjs).
    Si se omite (null), el módulo genera un stub que FALLA con un error
    explícito: un proceso programado sin lógica real nunca debe parecer
    exitoso (a diferencia de un endpoint, que responde 501 al cliente).
  EOT
  type        = string
  default     = null
}

variable "schedule_expression" {
  description = "Expresión de EventBridge (cron/rate). Las reglas programadas evalúan cron SIEMPRE en UTC: el llamante convierte la hora de America/Lima (UTC-5, sin horario de verano)."
  type        = string
}

variable "schedule_enabled" {
  description = "Si la regla de EventBridge está habilitada."
  type        = bool
  default     = true
}

variable "environment_variables" {
  description = "Variables de entorno de la función (p. ej. nombre de tabla DynamoDB)."
  type        = map(string)
  default     = {}
}

variable "iam_policy_statements" {
  description = "Declaraciones IAM de mínimo privilegio que necesita esta función (acciones + recursos)."
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

variable "enable_error_alarm" {
  description = "Si se crea la alarma de CloudWatch sobre errores de la Lambda (ADR-0008). Activa por defecto: un proceso batch sin usuario delante falla en silencio si nadie lo mira."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}
