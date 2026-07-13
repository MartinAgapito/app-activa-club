output "identity_arn" {
  description = "ARN de la identidad de correo verificada, para el permiso IAM ses:SendEmail de las futuras Lambdas."
  value       = aws_ses_email_identity.sender.arn
}

output "sender_email" {
  description = "Dirección de correo remitente configurada."
  value       = aws_ses_email_identity.sender.email
}
