# modules/endpoint

Módulo reutilizable "Lambda por endpoint" (ADR-0004): declara, para una
ruta+verbo de `docs/api/contratos-api.md`, la función Lambda, su rol IAM de
mínimo privilegio, el log group (`modules/log-group`), una alarma básica de
errores (ADR-0008) y el método/integración de API Gateway que la expone.

## Qué NO hace este módulo

- **No crea la API REST** (`aws_api_gateway_rest_api`) ni el **Cognito
  Authorizer** (`aws_api_gateway_authorizer`): se crean una única vez en el
  entorno llamante (`environments/dev`, `environments/demo`) y se pasan por
  variable (`rest_api_id`, `rest_api_execution_arn`, `cognito_authorizer_id`).
- **No crea el `aws_api_gateway_resource`** (el nodo de la ruta, p. ej.
  `members/{memberId}`): varios endpoints comparten segmentos de ruta (p. ej.
  `members/me` y `members/{memberId}` cuelgan de `members`), así que el árbol
  de recursos se construye una sola vez en el entorno llamante y se referencia
  vía `parent_resource_id`, para evitar declarar el mismo recurso dos veces.
- **No implementa lógica de negocio**: si no se pasa `source_zip_path`, la
  Lambda despliega un stub temporal que responde `501` con el formato de
  error estándar del contrato. `environments/dev/main.tf` pasa
  `source_zip_path = local.lambda_zip_path["<function_name>"]` en cada
  `module "endpoint_*"`, que resuelve al artefacto real generado por
  `node scripts/package-lambdas.mjs` cuando el pipeline de despliegue a dev
  define `var.lambda_artifacts_dir` (ver
  `docs/deployment/despliegue-dev.md`); en PRs y ejecuciones locales sin ese
  artefacto, sigue cayendo al stub, sin romper `terraform plan`/`validate`.

## Uso (ver `environments/dev/main.tf`)

```hcl
resource "aws_api_gateway_rest_api" "this" { ... }

resource "aws_api_gateway_authorizer" "cognito" {
  type          = "COGNITO_USER_POOLS"
  provider_arns = [module.cognito.user_pool_arn]
  rest_api_id   = aws_api_gateway_rest_api.this.id
  ...
}

# Árbol de recursos: ver locals.api_resource_paths en environments/dev/main.tf.
resource "aws_api_gateway_resource" "this" {
  for_each = toset(local.api_resource_paths)
  ...
}

module "endpoint_members_get_me" {
  source = "../../modules/endpoint"

  project     = var.project
  environment = var.environment

  function_name = "members-get-me"
  http_method   = "GET"
  resource_path = "members/me"
  requires_auth = true
  allowed_groups = ["member"]

  rest_api_id             = aws_api_gateway_rest_api.this.id
  rest_api_execution_arn  = aws_api_gateway_rest_api.this.execution_arn
  parent_resource_id      = aws_api_gateway_resource.this["members/me"].id
  cognito_authorizer_id   = aws_api_gateway_authorizer.cognito.id

  environment_variables = {
    DYNAMODB_TABLE_NAME = module.dynamodb_table.table_name
  }

  iam_policy_statements = [
    {
      actions   = ["dynamodb:Query"]
      resources = [module.dynamodb_table.table_arn, "${module.dynamodb_table.table_arn}/index/*"]
    }
  ]
}
```

Luego, el `aws_api_gateway_deployment` + `aws_api_gateway_stage` del entorno
depende de todos los `module.endpoint_*.method_id` / `.integration_id` para
forzar el redeploy cuando cambia cualquier endpoint (ver
`environments/dev/main.tf`).

## Alarmas y costo

Cada instancia crea, por defecto, una alarma de CloudWatch sobre `Errors`
(`enable_error_alarm = true`), sin acciones asociadas (sin SNS) para no
incurrir en costo por notificación. Con 10 endpoints de EP-02 esto usa 10 de
las 10 alarmas incluidas en la capa gratuita de CloudWatch; si un futuro
entorno (p. ej. `demo`) necesita desactivarlas para no exceder ese límite,
pasar `enable_error_alarm = false` en las instancias menos críticas.
