# Despliegue a dev (deploy-dev.yml)

Este documento describe el workflow de GitHub Actions
[`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml),
que automatiza el despliegue real al entorno `dev`: hasta ahora esto se hacía
a mano (`terraform apply` local + build/sync del frontend a S3 + invalidación
de CloudFront). Complementa, sin reemplazar, la validación de
[`pr-quality.yml`](../../.github/workflows/pr-quality.yml) (ver
[`ci-pull-request.md`](./ci-pull-request.md)).

## Disparadores

- `workflow_run`: automáticamente, cuando el workflow **"CI - Calidad de
  Pull Request"** termina (`types: [completed]`) sobre la rama `main`. El job
  `build-lambdas` solo continúa si `github.event.workflow_run.conclusion ==
'success'` — si el pipeline de calidad falló, el despliegue ni siquiera
  arranca.
- `workflow_dispatch`: para volver a desplegar el mismo commit de `main`
  manualmente (por ejemplo, tras arreglar un problema de infraestructura sin
  cambios de código).

Nunca se dispara por `pull_request`: un PR, sin importar cuántos commits
tenga, no puede llegar a pedir credenciales de escritura de este workflow.

## Por qué `workflow_run` y no `push` directo

`pr-quality.yml` ya corre en `push` a `main`. Encadenar `deploy-dev.yml` con
`workflow_run` (en vez de duplicar el mismo disparador `push`) evita:

- Desplegar código que todavía no pasó lint/typecheck/test/build/terraform
  plan/seguridad (si ambos workflows corrieran en paralelo sobre el mismo
  push, el despliegue podría adelantarse a un fallo de calidad).
- Repetir esas mismas validaciones dentro de `deploy-dev.yml`.

## Jobs (por etapa, ver nombres en la pestaña Actions)

### Etapa 1/5 — `build-lambdas`: empaquetar backend

Corre `node scripts/package-lambdas.mjs` (ver
[`scripts/package-lambdas.mjs`](../../scripts/package-lambdas.mjs)): usa
`esbuild` para bundlear cada handler real de `apps/api/src/handlers` en un
único archivo CommonJS autocontenido (sin `node_modules`, sin depender de que
Lambda resuelva imports sin extensión ni de que ejecute los `.ts` fuente de
los paquetes de workspace) y `archiver` para empaquetar un `.zip` por función
en `.lambda-artifacts/<function_name>.zip`. Publica ese directorio como
artefacto (`lambda-artifacts`) para el resto del pipeline.

### Etapa 2/5 — `terraform-apply-dev`: aplicar Terraform

1. Descarga el artefacto `lambda-artifacts` del job anterior.
2. Asume el rol OIDC de escritura **`activa-club-github-actions-deploy-dev`**
   (`secrets.AWS_DEPLOY_DEV_ROLE_ARN`), definido en
   [`infrastructure/terraform/bootstrap/main.tf`](../../infrastructure/terraform/bootstrap/main.tf).
3. `terraform init` / `validate` / `plan -out=tfplan-dev` / `apply tfplan-dev`
   sobre `infrastructure/terraform/environments/dev`, con
   `TF_VAR_lambda_artifacts_dir` apuntando al artefacto descargado: cada
   `module "endpoint_*"` pasa a usar
   `source_zip_path = local.lambda_zip_path["<function_name>"]` (ver
   `environments/dev/main.tf`), que resuelve al `.zip` real en vez del stub
   temporal de `modules/endpoint`.
4. Expone como _outputs_ del job: `api_base_url`, `web_bucket_name`,
   `cloudfront_distribution_id`, `cloudfront_domain_name`,
   `cognito_user_pool_id`, `cognito_web_client_id` (todos ya declarados en
   `environments/dev/outputs.tf`).

### Etapa 3/5 — `build-frontend`: build de apps/web

`npm run build --workspace apps/web` (Vite), inyectando
`VITE_API_BASE_URL`, `VITE_COGNITO_USER_POOL_ID` y `VITE_COGNITO_CLIENT_ID`
desde los outputs del apply anterior. Publica `apps/web/dist` como artefacto
(`frontend-dist`).

### Etapa 4/5 — `deploy-frontend-dev`: deploy del frontend

Asume de nuevo el rol de escritura de dev y:

1. `aws s3 sync ./frontend-dist s3://<web_bucket_name> --delete`.
2. `aws cloudfront create-invalidation --distribution-id <id> --paths "/*"`.

### Etapa 5/5 — `smoke-tests-dev`: comprobaciones mínimas

Sin credenciales AWS (endpoints públicos):

1. `GET https://<cloudfront_domain_name>/` — se espera `200` (con reintentos,
   la propagación de una invalidación/distribución nueva puede tardar).
2. `POST <api_base_url>/activation/verify` con `{}` — se espera `400`
   (validación real ejecutándose). Si responde `501`, el smoke test falla
   explícitamente: significa que el endpoint todavía sirve el stub temporal,
   no el handler real (mismo criterio que motivó este pipeline).

### `resumen-despliegue`

Job final (`if: always()`): publica en el resumen del run (`GITHUB_STEP_SUMMARY`)
el commit desplegado, las URLs de frontend/API y el resultado de cada etapa;
falla el workflow si alguna etapa no terminó en éxito.

## Secrets y variables requeridos

| Nombre                    | Tipo                        | Uso                                                                     | Estado actual                                                                                                                      |
| ------------------------- | --------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AWS_DEPLOY_DEV_ROLE_ARN` | Secret                      | Rol IAM de escritura para `terraform apply` + deploy de frontend en dev | **Pendiente**: requiere aplicar manualmente el nuevo rol de `bootstrap/main.tf` (`github_actions_deploy_dev`) y copiar su ARN aquí |
| `AWS_REGION`              | Variable de repo            | Región AWS (default `us-east-1`)                                        | Reutiliza la misma variable que `pr-quality.yml`                                                                                   |
| `DEV_SES_SENDER_EMAIL`    | Variable de repo (opcional) | Remitente SES de dev para `terraform apply` (dato no sensible)          | Si no se define, usa `no-reply-dev@example.com`                                                                                    |

Sin claves AWS estáticas en ningún paso (OIDC exclusivamente).

## Paso manual pendiente

Este workflow **no puede ejecutarse con éxito todavía**: el rol
`activa-club-github-actions-deploy-dev` está declarado en
`infrastructure/terraform/bootstrap/main.tf` pero, como el resto de
`bootstrap`, **no se aplica desde CI**. Antes de la primera ejecución real:

1. Aplicar manualmente `infrastructure/terraform/bootstrap` (con
   credenciales elevadas de una persona, nunca las de CI) para crear el rol.
2. Copiar el output `github_actions_deploy_dev_role_arn` al secreto de
   repositorio `AWS_DEPLOY_DEV_ROLE_ARN`.
3. Solo entonces disparar `deploy-dev.yml` (push a `main` o
   `workflow_dispatch`).

## Riesgos y consideraciones

- **Costo**: sin recursos nuevos de costo fijo; el `terraform apply` real
  puede crear/actualizar Lambdas, API Gateway y alarmas de CloudWatch
  (dentro de la capa gratuita para el volumen de este proyecto).
- **Seguridad**: el rol de escritura solo es asumible por push a `main`
  (nunca `pull_request`) y está acotado por prefijo de nombre a los recursos
  de `dev` (ver comentarios de `bootstrap/main.tf`); no tiene permisos sobre
  `demo`.
- **Un despliegue a la vez**: `concurrency: { group: deploy-dev,
cancel-in-progress: false }` encola despliegues en vez de cancelarlos, para
  no interrumpir un `terraform apply`/lock de estado a medio camino.
- **Propagación de CloudFront**: el smoke test reintenta unos segundos, pero
  una distribución **recién creada** (primera vez) puede tardar varios
  minutos en propagarse globalmente; un smoke test rojo por esta razón no
  necesariamente indica un despliegue roto — revisar manualmente antes de
  hacer rollback.

## Rollback

- **Frontend**: volver a ejecutar `deploy-dev.yml` (`workflow_dispatch`)
  apuntando a un commit anterior conocido-bueno, o restaurar manualmente
  desde una versión anterior del bucket (versionado no habilitado en el
  bucket web hoy; evaluarlo si el rollback de frontend se vuelve frecuente).
- **Backend/Terraform**: `terraform apply` de un commit anterior vuelve a
  dejar los handlers de esa versión (mismo mecanismo de
  `lambda_artifacts_dir`). La tabla DynamoDB y los buckets base tienen
  `prevent_destroy = true`: un rollback de código nunca borra datos.
