output "dynamodb_table_name" {
  value = module.dynamodb_table.table_name
}

output "cognito_user_pool_id" {
  value = module.cognito.user_pool_id
}

output "cognito_web_client_id" {
  value = module.cognito.web_client_id
}

output "migration_bucket_name" {
  value = module.storage.migration_bucket_name
}

output "assets_bucket_name" {
  value = module.storage.assets_bucket_name
}

output "web_bucket_name" {
  value = module.frontend_hosting.web_bucket_name
}

output "cloudfront_domain_name" {
  value = module.frontend_hosting.cloudfront_domain_name
}

output "ses_sender_identity_arn" {
  value = module.ses.identity_arn
}

output "api_base_url" {
  description = "URL base de invocación de la API REST de identidad/acceso (EP-02, US-011); las rutas del contrato cuelgan de aquí, p. ej. \"<api_base_url>/activation/verify\"."
  value       = aws_api_gateway_stage.this.invoke_url
}

output "api_rest_api_id" {
  value = aws_api_gateway_rest_api.this.id
}
