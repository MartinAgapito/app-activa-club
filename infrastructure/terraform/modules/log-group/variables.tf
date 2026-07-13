variable "name" {
  description = "Nombre completo del log group (p. ej. /aws/lambda/activa-club-dev-reservations-create)."
  type        = string
}

variable "retention_in_days" {
  description = "Retención de logs en días. Valor bajo por defecto para contener costo (ADR-0008)."
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags a aplicar al log group."
  type        = map(string)
  default     = {}
}
