# Despliegue final/prd (deploy-prd.yml)

Este documento describe el workflow de GitHub Actions
[`.github/workflows/deploy-prd.yml`](../../.github/workflows/deploy-prd.yml).

## No existe un entorno `prod` separado

Según [`README.md`](./README.md) y
[ADR-0001](../architecture/adr/ADR-0001-estrategia-entornos.md), la
estrategia de entornos de Activa Club es `dev` + `prd`: `prd` cumple el rol
de entorno final/"producción" del proyecto, ya que es el que se presenta al
jurado. No hay un tercer entorno `prod`.

## Estado actual: preparado, pero NO ejecutable todavía

A diferencia de `dev`, **`environments/prd` nunca tuvo un `terraform apply`
real**:

- No existe backend de estado remoto aplicado para `prd` (el bloque
  `backend "s3"` de `environments/prd/providers.tf` apunta al mismo bucket
  de `bootstrap`, con `key = "prd/terraform.tfstate"`, pero ese archivo de
  estado nunca se creó porque nunca se corrió `terraform apply` ahí).
- No existe un rol IAM de escritura para prd (equivalente al
  `activa-club-github-actions-deploy-dev` de dev): **deliberadamente no se
  crea en esta historia** (ver `infrastructure/terraform/bootstrap/main.tf`),
  para no dejar declarado un `apply` automatizable contra un entorno que
  todavía no existe.
- `environments/prd/main.tf` solo instancia los módulos base (DynamoDB,
  Cognito, S3, frontend hosting, SES); todavía no instancia
  `modules/endpoint` (Lambda + API Gateway) como sí hace `environments/dev`.
  Cuando esa historia se haga, este mismo pipeline funciona sin cambios
  (reutiliza el mecanismo de `TF_VAR_lambda_artifacts_dir` ya wireado en el
  workflow).

Por eso el primer job, `verificar-prerequisitos`, falla rápido y con un
mensaje explícito si el secreto `AWS_DEPLOY_PRD_ROLE_ARN` no está
configurado, en vez de fallar más adelante de forma confusa contra un
rol/backend inexistente. **No disparar este workflow hasta completar la
sección "Prerequisitos pendientes" de más abajo.**

## Disparadores

- `workflow_dispatch` únicamente — nunca `push` ni `pull_request`.
- Input opcional `version_tag`: etiqueta informativa (p. ej.
  `v1.0.0-prd-jurado`) que se registra en el resumen del despliegue.
- El job `verificar-prerequisitos` además exige que `github.ref` sea `main` o
  un tag `v*` ("rama o tag protegido"); cualquier otro `ref` falla de
  inmediato con un mensaje explícito.

## Aprobación manual (GitHub Environment `prd`)

El job **`terraform-apply-prd`** declara `environment: prd`. Si ese
Environment existe en el repositorio con al menos un _required reviewer_
configurado, GitHub **pausa el job y espera aprobación humana** antes de
ejecutar ningún paso — incluida la asunción de credenciales AWS. El plan que
se va a aplicar ya quedó publicado (como artefacto y en el resumen del run)
por el job anterior, `terraform-plan-prd`, así que quien aprueba puede
revisar exactamente qué se va a crear/cambiar/destruir antes de dar luz
verde. El `apply` posterior usa ese mismo plan ya generado (`terraform apply
tfplan-prd`), nunca uno recalculado en el momento.

## Jobs (por etapa)

1. **`verificar-prerequisitos`** — valida rama/tag protegido y que el
   secreto `AWS_DEPLOY_PRD_ROLE_ARN` exista; registra la versión solicitada.
2. **`build-lambdas-prd`** — mismo empaquetado que dev
   (`node scripts/package-lambdas.mjs`); el `.zip` de cada handler no
   depende del entorno destino.
3. **`terraform-plan-prd`** — `terraform plan` sobre `environments/prd`,
   publicado como artefacto (`tfplan-prd`) y en el resumen del run.
4. **`terraform-apply-prd`** (requiere aprobación del Environment `prd`) —
   `terraform apply` del plan ya generado; expone `web_bucket_name`,
   `cloudfront_distribution_id`, `cloudfront_domain_name`.
5. **`deploy-frontend-prd`** — build de `apps/web` + `aws s3 sync` +
   invalidación de CloudFront, igual que en dev.
6. **`registro-version-prd`** — resumen final (ref, SHA, `version_tag`,
   resultado de cada etapa) en `GITHUB_STEP_SUMMARY`. El historial de
   aprobaciones (quién aprobó y cuándo) queda además registrado de forma
   nativa por GitHub en la pestaña **Environments** del repositorio.

## Secrets y variables requeridos (cuando prd esté aprovisionado)

| Nombre                    | Tipo                                      | Uso                                                                     |
| ------------------------- | ----------------------------------------- | ----------------------------------------------------------------------- |
| `AWS_DEPLOY_PRD_ROLE_ARN` | Secret (idealmente del Environment `prd`) | Rol IAM de escritura para `terraform apply` + deploy de frontend en prd |
| `AWS_REGION`              | Variable de repo                          | Región AWS (default `us-east-1`)                                        |
| `PRD_SES_SENDER_EMAIL`    | Variable de repo (opcional)               | Remitente SES de prd (dato no sensible)                                 |

Secretos aislados por entorno: se recomienda configurar
`AWS_DEPLOY_PRD_ROLE_ARN` como secreto **del Environment `prd`**
(Settings → Environments → prd → Environment secrets), no como secreto de
repositorio compartido, para que ni siquiera un workflow con
`environment: prd` mal configurado en otra rama pueda leerlo sin pasar por
la aprobación.

## Prerequisitos pendientes (antes de la primera ejecución real)

Estos pasos son manuales y quedan fuera del alcance de esta entrega
(requieren decisiones/credenciales del dueño del proyecto):

1. **Crear el GitHub Environment `prd`** en Settings > Environments, con al
   menos un _required reviewer_. Mientras no exista con esa regla, GitHub
   crearía el Environment "al vuelo" sin protección la primera vez que el
   job lo referencie — es decir, **sin pausar a esperar aprobación**.
2. **Provisionar `prd` en AWS**: aplicar manualmente
   `infrastructure/terraform/bootstrap` si aún no incluye un rol de
   escritura para prd (historia posterior: agregar
   `activa-club-github-actions-deploy-prd`, análogo al de dev pero con el
   trust policy acotado a este `workflow_dispatch` y los recursos de
   `prd`), y luego `terraform apply` de `environments/prd` para crear su
   backend de estado y recursos base.
3. **Completar `environments/prd/main.tf`** con los mismos
   `module "endpoint_*"` que `environments/dev/main.tf` (historia de backend
   posterior), para que prd también sirva los endpoints reales.
4. Configurar los secretos/variables de la tabla anterior en el Environment
   `prd`.

## Riesgos y consideraciones

- **Es el entorno de la presentación al jurado**: cualquier `apply` aquí
  requiere doble cuidado; de ahí la aprobación manual obligatoria y el
  apply-del-plan-ya-revisado (nunca un plan recalculado en el momento del
  apply).
- **Costo**: mismos servicios serverless de bajo costo que dev; un segundo
  entorno completo duplica el costo marginal (DynamoDB on-demand, S3,
  Cognito, CloudFront `PriceClass_100`), pero sigue siendo bajo.
- **Destrucción accidental**: `prevent_destroy = true` protege la tabla
  DynamoDB y los buckets S3 de prd igual que en dev.
- **No ejecutar contra un rol/backend inexistente**: ver sección "Estado
  actual" — el primer job de este workflow existe específicamente para
  evitar ese error.
