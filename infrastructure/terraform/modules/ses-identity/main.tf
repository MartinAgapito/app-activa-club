# Identidad de remitente SES por entorno. Ver ADR-0006.
#
# SES Templates (plantillas por tipo de evento) y los permisos IAM
# `ses:SendEmail` de cada Lambda de negocio se agregan en Sprint 1 (US-009),
# junto con el código real que dispara los correos. Este módulo solo
# verifica la identidad de remitente, prerequisito para poder enviar.
#
# aws_ses_email_identity no admite `tags` (limitación del recurso).

resource "aws_ses_email_identity" "sender" {
  email = var.sender_email
}
