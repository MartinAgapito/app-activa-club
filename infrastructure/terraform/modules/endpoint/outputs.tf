output "function_name" {
  description = "Nombre físico de la función Lambda."
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "ARN de la función Lambda."
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "invoke_arn de la función, usado por la integración de API Gateway."
  value       = aws_lambda_function.this.invoke_arn
}

output "log_group_name" {
  description = "Nombre del log group de CloudWatch de esta función."
  value       = module.log_group.name
}

output "method_id" {
  description = "ID del método de API Gateway (aws_api_gateway_method), usado para forzar el redeploy del stage cuando cambia."
  value       = aws_api_gateway_method.this.id
}

output "integration_id" {
  description = "ID de la integración de API Gateway (aws_api_gateway_integration), usado para forzar el redeploy del stage cuando cambia."
  value       = aws_api_gateway_integration.this.id
}

output "using_stub" {
  description = "true si esta instancia despliega el stub temporal (sin source_zip_path real)."
  value       = local.using_stub
}
