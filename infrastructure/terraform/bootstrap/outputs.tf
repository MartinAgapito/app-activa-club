output "state_bucket_name" {
  description = "Nombre del bucket S3 de estado remoto. Copiar al bloque backend \"s3\" de cada entorno."
  value       = aws_s3_bucket.terraform_state.id
}

output "state_lock_table_name" {
  description = "Nombre de la tabla DynamoDB de lock. Copiar al bloque backend \"s3\" de cada entorno."
  value       = aws_dynamodb_table.terraform_locks.name
}

output "oidc_provider_arn" {
  description = "ARN del proveedor OIDC de GitHub Actions."
  value       = local.oidc_provider_arn
}

output "github_actions_plan_role_arn" {
  description = "ARN del rol IAM de solo lectura para el job \"terraform\" de pr-quality.yml. Copiar al secreto de repositorio AWS_OIDC_ROLE_ARN."
  value       = aws_iam_role.github_actions_plan.arn
}
