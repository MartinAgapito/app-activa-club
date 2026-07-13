output "migration_bucket_name" {
  description = "Nombre del bucket de migración."
  value       = aws_s3_bucket.migration.id
}

output "migration_bucket_arn" {
  description = "ARN del bucket de migración, para el permiso IAM de lectura de la futura Lambda de migración."
  value       = aws_s3_bucket.migration.arn
}

output "assets_bucket_name" {
  description = "Nombre del bucket de activos."
  value       = aws_s3_bucket.assets.id
}

output "assets_bucket_arn" {
  description = "ARN del bucket de activos."
  value       = aws_s3_bucket.assets.arn
}
