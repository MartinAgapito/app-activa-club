# Sin recursos todavía — ver README.md de este módulo.
#
# TODO(US-009, Sprint 1): cuando exista el artefacto real de apps/api,
# declarar aquí: aws_lambda_function, aws_iam_role + aws_iam_role_policy
# (mínimo privilegio, usando var.iam_policy_statements), integración con
# API Gateway (aws_api_gateway_resource/method/integration + Cognito
# Authorizer condicionado a var.requires_auth/var.allowed_groups), y el
# log group vía module "log_group" { source = "../log-group" ... } con
# retención var.log_retention_in_days.
#
# Un módulo Terraform sin recursos es válido (`terraform validate` pasa);
# se deja así intencionalmente para no inventar funcionalidad de negocio
# en Sprint 0 (ver US-004, punto 4).
