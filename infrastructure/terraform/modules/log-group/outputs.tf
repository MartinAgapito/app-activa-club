output "name" {
  description = "Nombre del log group creado."
  value       = aws_cloudwatch_log_group.this.name
}

output "arn" {
  description = "ARN del log group, para permisos IAM de escritura de logs (logs:CreateLogStream/PutLogEvents) de mínimo privilegio."
  value       = aws_cloudwatch_log_group.this.arn
}
