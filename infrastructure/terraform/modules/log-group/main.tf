# Módulo genérico y reutilizable de CloudWatch Log Group con retención
# básica (ADR-0008). Se usará una instancia por cada Lambda que agregue el
# módulo modules/endpoint en Sprint 1 (una función = un log group), y
# eventualmente para el log de acceso de API Gateway.
#
# No se instancia todavía en environments/dev ni environments/prd porque
# aún no existen las Lambdas ni la API Gateway reales que emitirían esos
# logs (Sprint 1, US-009). Mantenerlo como módulo listo evita inventar
# nombres de log group ficticios ahora.

resource "aws_cloudwatch_log_group" "this" {
  name              = var.name
  retention_in_days = var.retention_in_days
  tags              = var.tags
}
