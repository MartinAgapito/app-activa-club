# modules/endpoint (placeholder — Sprint 1)

Módulo preparado pero **sin recursos** todavía. Cuando Backend (US-009,
Sprint 1) entregue el código real de cada función (`apps/api`), este módulo
se completará para declarar, por endpoint (ADR-0004):

- Función Lambda (Node.js 20 + TypeScript), a partir del artefacto empaquetado
  de `apps/api`.
- Integración con API Gateway REST (recurso + método + integración Lambda
  proxy).
- Cognito Authorizer (validación de JWT en el borde, ADR-0002) y, si aplica,
  restricción por grupo (`member`/`admin`) dentro del propio handler.
- Rol IAM de **mínimo privilegio por función**: solo las acciones DynamoDB/
  SES/S3/Cognito que ese endpoint específico necesita (ADR-0004).
- Un `aws_cloudwatch_log_group` (vía `modules/log-group`) con retención básica
  para esa función (ADR-0008).
- Alarmas mínimas de CloudWatch para la demo (tasa de errores 5xx, errores de
  la Lambda de pagos — ADR-0008), donde corresponda.

## Por qué no hay recursos aún

Declarar Lambdas o rutas de API Gateway ahora significaría inventar nombres de
función y contratos que no existen (el código de `apps/api` es de Sprint 1).
Eso violaría la norma de "contratos antes de implementar" y el alcance de
US-004 (base de infraestructura, sin funcionalidad de negocio). `variables.tf`
documenta la interfaz esperada para que, al llegar el código real, completar
este módulo sea un ejercicio mecánico y no un rediseño.

## Uso previsto (Sprint 1, ejemplo ilustrativo — no aplicar todavía)

```hcl
module "reservations_create" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name    = "reservations-create"
  handler          = "index.handler"
  source_zip_path  = "../../../../apps/api/dist/reservations-create.zip"
  http_method      = "POST"
  resource_path    = "reservations"
  requires_auth    = true
  allowed_groups   = ["member"]

  environment_variables = {
    DYNAMODB_TABLE_NAME = module.dynamodb_table.table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:PutItem", "dynamodb:Query"]
      resources = [module.dynamodb_table.table_arn, "${module.dynamodb_table.table_arn}/index/*"]
    }
  ]
}
```
