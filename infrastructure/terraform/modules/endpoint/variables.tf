# Interfaz de modules/endpoint (US-011, Sprint 1): Lambda + método de API
# Gateway + permisos IAM de mínimo privilegio + log group + alarma por
# función (ADR-0004, ADR-0008). El árbol de recursos de API Gateway (rutas,
# API REST, Cognito Authorizer, deployment/stage) se administra una sola vez
# en el entorno que instancia este módulo (environments/dev, environments/prd)
# para evitar declarar el mismo `aws_api_gateway_resource` más de una vez
# cuando varios endpoints comparten un segmento de ruta (p. ej. "members").

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
  description = "Nombre corto de la función/endpoint (p. ej. \"reservations-create\"), tal como se documenta en docs/api/contratos-api.md."
  type        = string
}

variable "handler" {
  description = "Handler de la función Lambda (p. ej. index.handler). Si no se especifica y tampoco se especifica source_zip_path, se usa el handler del stub temporal (index.handler)."
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
  description = <<-EOT
    Ruta al artefacto empaquetado (.zip) de la función, generado por el build
    de apps/api. Si se omite (null, valor por defecto), el módulo genera un
    stub temporal (HTTP 501) para no bloquear el aprovisionamiento de
    infraestructura mientras la lógica de negocio real no existe todavía
    (US-011, criterio de aceptación 8). Las historias de backend reemplazan
    este valor apuntando al zip real una vez implementado el handler.
  EOT
  type        = string
  default     = null
}

variable "http_method" {
  description = "Verbo HTTP del endpoint (GET, POST, PATCH, DELETE, ...)."
  type        = string
}

variable "resource_path" {
  description = <<-EOT
    Ruta REST del endpoint, relativa a la raíz de la API (p. ej.
    "reservations" o "members/{memberId}/approve"), tal como se documenta en
    docs/api/contratos-api.md. Se usa para derivar los parámetros de ruta
    (p. ej. "{memberId}") y para acotar el permiso de invocación de API
    Gateway sobre la Lambda; el recurso de API Gateway en sí ya debe existir
    (creado una única vez por el entorno llamante) e identificarse mediante
    var.parent_resource_id.
  EOT
  type        = string
}

variable "requires_auth" {
  description = "Si el endpoint requiere Cognito Authorizer (JWT válido). Casi todos los endpoints lo requieren salvo activación/registro inicial."
  type        = bool
  default     = true
}

variable "allowed_groups" {
  description = "Grupos de Cognito autorizados a invocar el endpoint (p. ej. [\"admin\"]). Lista vacía = cualquier usuario autenticado. La verificación final de grupo ocurre dentro del handler (claim cognito:groups, ADR-0002); este valor documenta la intención y se usa para etiquetar el recurso."
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

variable "enable_error_alarm" {
  description = "Si se crea una alarma de CloudWatch sobre errores de esta Lambda (ADR-0008). Activa por defecto; se puede desactivar puntualmente para no exceder la capa gratuita de alarmas de CloudWatch."
  type        = bool
  default     = true
}

variable "rest_api_id" {
  description = "ID de la API REST de API Gateway (aws_api_gateway_rest_api) a la que pertenece este endpoint, creada una única vez por el entorno llamante."
  type        = string
}

variable "rest_api_execution_arn" {
  description = "execution_arn de la API REST, usado para acotar el permiso de invocación (aws_lambda_permission) al método/ruta de este endpoint."
  type        = string
}

variable "parent_resource_id" {
  description = "ID del aws_api_gateway_resource ya creado (por el entorno llamante) que corresponde exactamente a var.resource_path, donde se define el método HTTP de este endpoint."
  type        = string
}

variable "cognito_authorizer_id" {
  description = "ID del aws_api_gateway_authorizer de Cognito (ADR-0002), requerido cuando var.requires_auth es true."
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}
