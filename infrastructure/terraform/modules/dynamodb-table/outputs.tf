output "table_name" {
  description = "Nombre físico de la tabla (activa-club-<env>)."
  value       = aws_dynamodb_table.this.name
}

output "table_arn" {
  description = "ARN de la tabla, para políticas IAM de mínimo privilegio de las futuras Lambdas."
  value       = aws_dynamodb_table.this.arn
}

output "gsi_names" {
  description = "Nombres de los índices secundarios globales disponibles."
  value       = ["GSI1", "GSI2", "GSI3"]
}
