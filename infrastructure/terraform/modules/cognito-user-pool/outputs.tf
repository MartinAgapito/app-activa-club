output "user_pool_id" {
  description = "ID del User Pool, para el Authorizer de API Gateway (Sprint 1) y el frontend."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "ARN del User Pool, para el Cognito Authorizer de API Gateway."
  value       = aws_cognito_user_pool.this.arn
}

output "web_client_id" {
  description = "Client ID del App Client del SPA."
  value       = aws_cognito_user_pool_client.web.id
}

output "member_group_name" {
  description = "Nombre del grupo member."
  value       = aws_cognito_user_group.member.name
}

output "admin_group_name" {
  description = "Nombre del grupo admin."
  value       = aws_cognito_user_group.admin.name
}
