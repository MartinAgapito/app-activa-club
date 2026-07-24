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
  Pull Request (US-005): lint, formato, typecheck, pruebas, build,
  validación de Terraform condicional y controles básicos de seguridad.
  Workflow: [`.github/workflows/pr-quality.yml`](../../.github/workflows/pr-quality.yml).
- Despliegue a desarrollo y despliegue final/prd: pendientes de historias
  posteriores (aún no ejecutadas). Requieren, como prerequisito, aplicar
  `infrastructure/terraform/bootstrap` (ver `terraform-infraestructura.md`)
  sobre una cuenta AWS designada para el proyecto.
