variable "project" {
  description = "Nombre corto del proyecto, usado como prefijo de nombres de recursos."
  type        = string
  default     = "activa-club"
}

variable "aws_region" {
  description = "Región AWS donde se crea el backend de estado y el rol OIDC (recurso IAM es global, pero el provider requiere una región)."
  type        = string
  default     = "us-east-1"
}

variable "github_org" {
  description = "Organización o usuario de GitHub dueño del repositorio (para restringir el trust policy del rol OIDC a este repo exacto)."
  type        = string
}

variable "github_repo" {
  description = "Nombre del repositorio de GitHub (sin el owner)."
  type        = string
}

variable "create_oidc_provider" {
  description = <<-EOT
    Si es true, crea el proveedor OIDC de GitHub Actions en esta cuenta AWS.
    AWS solo permite UN proveedor OIDC por URL en toda la cuenta: si ya existe
    uno para "token.actions.githubusercontent.com" (creado por otro proyecto
    o historia), poner esto en false y completar existing_oidc_provider_arn.
  EOT
  type        = bool
  default     = true
}

variable "existing_oidc_provider_arn" {
  description = "ARN del proveedor OIDC de GitHub ya existente en la cuenta, usado solo si create_oidc_provider = false."
  type        = string
  default     = null
}

variable "state_bucket_name" {
  description = "Nombre del bucket S3 para el estado remoto de Terraform. Debe ser único a nivel global de S3."
  type        = string
  default     = "activa-club-terraform-state"
}

variable "state_lock_table_name" {
  description = "Nombre de la tabla DynamoDB usada como lock de estado de Terraform."
  type        = string
  default     = "activa-club-terraform-locks"
}

variable "tags" {
  description = "Tags adicionales a fusionar con las tags comunes del proyecto."
  type        = map(string)
  default     = {}
}
