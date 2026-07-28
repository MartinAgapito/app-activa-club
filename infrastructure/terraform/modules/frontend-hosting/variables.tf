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

variable "price_class" {
  description = "Price class de la distribución CloudFront (control de costo). PriceClass_100 cubre Norteamérica/Europa, suficiente para la demo."
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto/entorno."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Proxy /api/* hacia API Gateway (fix P0-1: sin esto, no hay CORS en ninguna
# capa). La SPA y la API cuelgan del mismo dominio de CloudFront, así que el
# navegador nunca necesita hacer preflight OPTIONS (no hay cross-origin).
# Ambas variables van juntas y son opcionales: si el entorno llamante todavía
# no tiene API Gateway (p. ej. prd antes de Sprint 1), se omiten y la
# distribución se arma igual que antes, solo con el origen S3.
# ---------------------------------------------------------------------------

variable "api_origin_domain_name" {
  description = <<-EOT
    Dominio execute-api.<region>.amazonaws.com del API Gateway REST a
    exponer bajo /api/* en esta misma distribución CloudFront. null (valor
    por defecto) = no se agrega origen ni behavior de API.
  EOT
  type        = string
  default     = null
}

variable "api_origin_path" {
  description = <<-EOT
    Path que CloudFront antepone a cada request hacia el origen de API
    Gateway (el stage, p. ej. "/dev"): CloudFront reenvía la URI completa
    del viewer ("/api/..."), así que este valor la antecede para llegar al
    recurso real (p. ej. "/dev" + "/api/activation/verify" =
    "/dev/api/activation/verify", que es exactamente donde vive ese recurso
    en API Gateway — ver environments/<entorno>/main.tf, resource
    "aws_api_gateway_resource" "api_root"). Requerido cuando
    var.api_origin_domain_name no es null.
  EOT
  type        = string
  default     = null
}
