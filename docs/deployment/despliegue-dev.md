# Despliegue a dev (deploy-dev.yml)

Este documento describe el workflow de GitHub Actions
[`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml),
que automatiza el despliegue real al entorno `dev`: hasta ahora esto se hacía
a mano (`terraform apply` local + build/sync del frontend a S3 + invalidación
de CloudFront). Complementa, sin reemplazar, la validación de
[`pr-quality.yml`](../../.github/workflows/pr-quality.yml) (ver
[`ci-pull-request.md`](./ci-pull-request.md)).

## Disparadores

- `push` sobre la rama `main`: automáticamente, en cuanto un PR se mergea.
  **Solo si** el push toca alguna ruta que puede cambiar lo desplegado
  (`paths` del workflow: `apps/**`, `packages/**`,
  `infrastructure/terraform/**`, `scripts/**`, `package.json`,
  `package-lock.json`, `tsconfig.base.json`, `.nvmrc`, o el propio
  `deploy-dev.yml`). Es una lista blanca, no negra: un PR de solo
  documentación, configuración de lint u otro archivo que no afecte el
  build/deploy no dispara nada, sin necesidad de mantener una lista de
  exclusiones que crezca con cada archivo nuevo. Si un PR mezcla algo de
  esa lista con otra cosa, despliega normalmente.
- `workflow_dispatch`: para volver a desplegar el mismo commit de `main`
  manualmente (por ejemplo, tras arreglar un problema de infraestructura sin
  cambios de código).

Nunca se dispara por `pull_request`: un PR, sin importar cuántos commits
tenga, no puede llegar a pedir credenciales de escritura de este workflow.

## Por qué es seguro disparar por `push` directo a `main`

`deploy-dev.yml` reacciona directamente al `push` a `main` (el propio
merge), sin encadenarse al resultado de `pr-quality.yml` mediante
`workflow_run`. Esto es seguro porque la protección de la rama `main`
(Settings > Branches, "Require status checks to pass") exige que el check
`CI OK (gate)` de [`pr-quality.yml`](../../.github/workflows/pr-quality.yml)
(ver [`ci-pull-request.md`](./ci-pull-request.md)) haya pasado **antes** de
permitir el merge. En otras palabras: para cuando el `push` a `main` existe,
el código que trae ya fue validado por lint/typecheck/test/build/terraform
plan/seguridad — no hace falta re-chequear ese resultado dentro de
`deploy-dev.yml`.

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
desde los outputs del apply anterior, más `VITE_CULQI_PUBLIC_KEY` (US-019,
ADR-0007) desde la variable de repositorio `DEV_CULQI_PUBLIC_KEY` (o el
placeholder `pk_test_PENDIENTE_CULQI_SANDBOX_KEY` si no está definida). Es la
llave **pública** de Culqi: Culqi.js la usa en el navegador para tokenizar la
tarjeta, así que no se trata como secreto (no requiere OIDC/SSM), pero sí es
un valor configurable por entorno. Publica `apps/web/dist` como artefacto
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

| Nombre                    | Tipo                        | Uso                                                                                                                                                           | Estado actual                                                                 |
| ------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `AWS_DEPLOY_DEV_ROLE_ARN` | Secret                      | Rol IAM de escritura para `terraform apply` + deploy de frontend en dev                                                                                       | Aplicado (rol `activa-club-github-actions-deploy-dev` de `bootstrap/main.tf`) |
| `AWS_REGION`              | Variable de repo            | Región AWS (default `us-east-1`)                                                                                                                              | Reutiliza la misma variable que `pr-quality.yml`                              |
| `DEV_SES_SENDER_EMAIL`    | Variable de repo (opcional) | Remitente SES de dev para `terraform apply` (dato no sensible)                                                                                                | Si no se define, usa `no-reply-dev@example.com`                               |
| `DEV_CULQI_PUBLIC_KEY`    | Variable de repo (opcional) | Llave **pública** de Culqi sandbox, inyectada como `VITE_CULQI_PUBLIC_KEY` en el build del frontend (US-019). No es secreta, pero sí configurable por entorno | Si no se define, usa el placeholder `pk_test_PENDIENTE_CULQI_SANDBOX_KEY`     |

Sin claves AWS estáticas en ningún paso (OIDC exclusivamente). La llave
**privada** de Culqi nunca pasa por GitHub Actions: vive directamente en SSM
Parameter Store (`aws_ssm_parameter.culqi_private_key`,
`infrastructure/terraform/environments/dev/main.tf`) y solo la leen en
runtime las Lambdas de pago (ver "Secreto de Culqi sandbox (US-019)" más
abajo).

## Mantenimiento de permisos: cuándo hace falta un apply manual de bootstrap

El rol `activa-club-github-actions-deploy-dev` (igual que el de solo lectura
`activa-club-github-actions-plan`) está declarado en
`infrastructure/terraform/bootstrap/main.tf`, que **no se aplica desde
CI** (ver la cabecera de ese archivo). Esto significa que cada vez que un
cambio de infraestructura hace que ese rol necesite tocar un servicio de AWS
que antes no tocaba, hace falta un paso manual **antes** de mergear el PR
correspondiente:

1. Aplicar manualmente `infrastructure/terraform/bootstrap` (con
   credenciales elevadas de una persona, nunca las de CI) para otorgar el
   permiso nuevo.
2. Recién entonces mergear el PR que agrega el recurso/cambio que necesita
   ese permiso — si se mergea antes, `deploy-dev.yml` (o el job de
   `terraform plan` de `pr-quality.yml`, que usa el rol de solo lectura)
   falla con `AccessDenied`.

Ya pasó varias veces en la práctica (ejemplos reales en el historial de
`bootstrap/main.tf`): el rol de escritura inicial, permisos de CloudFront
Function del módulo Terraform de CloudFront, `cloudfront:Describe*` para el
rol de solo lectura al agregarse una `aws_cloudfront_function`, y — a partir
de US-019 — los permisos de `ssm:GetParameter`/`ssm:PutParameter` y
`kms:Decrypt`/`kms:Encrypt`/`kms:GenerateDataKey` (acotados por condición
`kms:ViaService`) que necesitan tanto el rol de escritura (`deploy-dev`,
para crear/leer el parámetro) como el de solo lectura (`plan`, para que
`terraform plan` en Pull Requests pueda refrescarlo) al agregarse
`aws_ssm_parameter.culqi_private_key`. Es esperable que vuelva a pasar
cuando una historia futura agregue otro servicio de AWS nuevo (p. ej. SNS
para notificaciones o un nuevo bucket).

## Secreto de Culqi sandbox (US-019): SSM Parameter Store

`infrastructure/terraform/environments/dev/main.tf` declara
`aws_ssm_parameter.culqi_private_key`
(`/activa-club/dev/culqi/private-key`, tipo `SecureString`, cifrado con la
llave administrada por defecto de la cuenta `alias/aws/ssm`, sin costo fijo
de KMS). Guarda la llave **privada** de Culqi sandbox (RN-PAG-04/08,
ADR-0007): las Lambdas `payments-create` (`POST /payments`) y
`payments-webhook` (`POST /payments/webhook`) la leen en runtime vía
`ssm:GetParameter` (nombre del parámetro inyectado como la variable de
entorno `CULQI_PRIVATE_KEY_PARAM_NAME`), nunca como texto plano en el
código ni en variables de Terraform versionadas.

### Por qué no hay todavía una cuenta Culqi sandbox real

Terraform aplica el parámetro con un valor **placeholder** explícito
(`"PENDIENTE_CULQI_SANDBOX_KEY"`) porque, al momento de US-019, todavía no
existe una cuenta de Culqi sandbox asignada al proyecto (ver la propia
historia, "casos alternativos"). El bloque `lifecycle { ignore_changes =
[value] }` del recurso es intencional: una vez cargado el valor real a
mano, un futuro `terraform apply` de otro cambio de infraestructura **no**
lo vuelve a pisar con el placeholder.

### Cargar el valor real (cuando exista la cuenta Culqi sandbox)

Con las credenciales del rol de escritura de dev (o de una persona con
permiso equivalente, nunca desde el repositorio):

```bash
aws ssm put-parameter \
  --name "/activa-club/dev/culqi/private-key" \
  --type SecureString \
  --value "<llave-privada-real-de-culqi-sandbox>" \
  --overwrite
```

No hace falta ningún cambio de Terraform ni un nuevo despliegue: las
Lambdas de pago leen el valor vigente en cada invocación (`ssm:GetParameter`
sin caché de larga duración). La llave **pública** correspondiente se
configura aparte, como variable de repositorio `DEV_CULQI_PUBLIC_KEY` (ver
tabla de secrets/variables más arriba) — no es secreta, así que no pasa por
SSM.

### Rotación

Rotar la llave privada es el mismo comando `aws ssm put-parameter
--overwrite` de arriba con el valor nuevo. Al no cachearse en el código de
las Lambdas más allá de la propia invocación, el cambio queda efectivo de
inmediato para invocaciones nuevas, sin necesidad de reiniciar ni
redesplegar nada. Rotar también implica actualizar `DEV_CULQI_PUBLIC_KEY`
en las variables del repositorio si Culqi emite un par de llaves nuevo
(pública + privada juntas), y volver a desplegar el frontend
(`workflow_dispatch` de `deploy-dev.yml`) para que el build recoja la
llave pública nueva.

## Riesgos y consideraciones

- **Costo**: sin recursos nuevos de costo fijo; el `terraform apply` real
  puede crear/actualizar Lambdas, API Gateway y alarmas de CloudWatch
  (dentro de la capa gratuita para el volumen de este proyecto). El
  parámetro SSM de Culqi (US-019) no tiene costo (SSM Standard tier +
  llave KMS administrada por AWS, sin cargo). Los 6 endpoints de EP-03
  agregan 6 alarmas de CloudWatch más (16 en total con los 10 de EP-02),
  ya fuera de las 10 incluidas en la capa gratuita: costo estimado
  ~US$0.60/mes adicionales (ver `modules/endpoint/README.md`).
- **Seguridad**: el rol de escritura solo es asumible por push a `main`
  (nunca `pull_request`) y está acotado por prefijo de nombre a los recursos
  de `dev` (ver comentarios de `bootstrap/main.tf`); no tiene permisos sobre
  `prd`.
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
