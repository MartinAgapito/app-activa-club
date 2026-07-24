# docs/deployment

Guía de entornos, CI/CD y despliegues del proyecto Activa Club: entornos
(`dev`, `prd`), pipelines de GitHub Actions, aprobaciones manuales para
despliegues sensibles y procedimientos de rollback.

## Infraestructura y pipelines documentados

- [`terraform-infraestructura.md`](./terraform-infraestructura.md) — Base de
  infraestructura como código (US-004): estructura de módulos, backend de
  estado (local hoy, plan de migración a S3+DynamoDB), entornos `dev`/`prd`,
  variables/secretos requeridos y procedimiento de aplicación manual
  controlada. Código: [`infrastructure/terraform/`](../../infrastructure/terraform/).
- [`ci-pull-request.md`](./ci-pull-request.md) — Pipeline de calidad de
  Pull Request (US-005): lint, typecheck, pruebas, build (jobs separados),
  validación de Terraform condicional y controles básicos de seguridad.
  Workflow: [`.github/workflows/pr-quality.yml`](../../.github/workflows/pr-quality.yml).
- [`despliegue-dev.md`](./despliegue-dev.md) — Despliegue real y automático
  al entorno `dev`: empaqueta los handlers reales de `apps/api`
  ([`scripts/package-lambdas.mjs`](../../scripts/package-lambdas.mjs)),
  aplica Terraform, despliega el frontend a S3/CloudFront y corre smoke
  tests. Workflow: [`.github/workflows/deploy-dev.yml`](../../.github/workflows/deploy-dev.yml).
  Requiere aplicar manualmente, una única vez, el rol de escritura
  `activa-club-github-actions-deploy-dev` declarado en
  `infrastructure/terraform/bootstrap/main.tf` (ver ese documento).
- [`despliegue-prd.md`](./despliegue-prd.md) — Despliegue final/prd
  (cumple el rol de "producción" del proyecto — no hay un entorno `prod`
  separado, ver ADR-0001): disparo manual, aprobación humana obligatoria vía
  GitHub Environment `prd`, apply del plan ya revisado. Workflow:
  [`.github/workflows/deploy-prd.yml`](../../.github/workflows/deploy-prd.yml).
  **No ejecutable todavía**: `environments/prd` nunca tuvo un `apply` real
  ni tiene rol de escritura propio; ver la sección "Prerequisitos
  pendientes" de ese documento.
