output "function_name" {
  description = "Nombre físico de la función Lambda."
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "ARN de la función Lambda."
  value       = aws_lambda_function.this.arn
}

output "log_group_name" {
  description = "Nombre del log group de CloudWatch de esta función."
  value       = module.log_group.name
}

output "schedule_rule_name" {
  description = "Nombre de la regla de EventBridge que dispara la función (null si es de invocación directa)."
  value       = try(aws_cloudwatch_event_rule.schedule[0].name, null)
}

output "using_stub" {
  description = "true si esta instancia despliega el stub (sin source_zip_path real)."
  value       = local.using_stub
}
