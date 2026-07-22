# infrastructure/terraform

Infraestructura como código (Terraform) de Activa Club en AWS.

Base de infraestructura de US-004 (Sprint 0): estructura de módulos,
entornos `dev`/`demo`, y preparación del backend de estado remoto y de la
autenticación OIDC de GitHub Actions.

Desde US-011 (Sprint 1), `environments/dev` además provisiona la API REST +
Lambda por endpoint (ADR-0004) de los endpoints de identidad/acceso de EP-02
(`docs/api/contratos-api.md`), con Cognito Authorizer por rol (ADR-0002) y
log group + alarma por función (ADR-0008). Las Lambdas despliegan un stub
temporal (HTTP 501) hasta que las historias de backend correspondientes
(US-012, US-013, US-016, US-017, US-018) reemplacen su artefacto real; ver
`modules/endpoint/README.md`. `environments/demo` todavía no instancia estos
endpoints (queda para cuando exista su propio pipeline de despliegue).

Documentación completa: [`docs/deployment/terraform-infraestructura.md`](../../docs/deployment/terraform-infraestructura.md).

## Estructura

```
infrastructure/terraform/
├── bootstrap/            # Backend de estado remoto + OIDC GitHub (aplicación manual única)
├── modules/               # Módulos reutilizables sin estado propio
│   ├── dynamodb-table/
│   ├── cognito-user-pool/
│   ├── s3-storage/
│   ├── frontend-hosting/
│   ├── ses-identity/
│   ├── log-group/
│   └── endpoint/           # Lambda + método API Gateway por endpoint (US-011)
└── environments/
    ├── dev/
    └── demo/
```

## Principios aplicados

- Toda infraestructura AWS se declara en Terraform; sin cambios manuales en
  consola.
- Entornos separados `dev`/`demo` (carpetas `environments/<env>`, ver
  justificación en la documentación de despliegue) — [ADR-0001](../../docs/architecture/adr/ADR-0001-estrategia-entornos.md).
- Autenticación de GitHub Actions hacia AWS mediante OIDC (`infrastructure/terraform/bootstrap`),
  sin credenciales estáticas.
- Mínimo privilegio en IAM (el rol de CI de `bootstrap` es de solo lectura) y
  etiquetas/tags consistentes (`Project`, `Environment`, `ManagedBy`) en
  todos los recursos.
- Estado remoto (S3 + DynamoDB lock) definido en `bootstrap/`, pendiente de
  aplicarse cuando exista una cuenta AWS designada para el proyecto;
  mientras tanto, cada entorno usa backend local (ver `.gitignore`).
- `prevent_destroy` en DynamoDB y buckets S3 para evitar destrucción
  accidental de datos.

## Validación local (sin credenciales AWS del proyecto)

```bash
terraform fmt -recursive -diff
cd bootstrap && terraform init -backend=false && terraform validate
cd ../environments/dev && terraform init -backend=false && terraform validate
cd ../environments/demo && terraform init -backend=false && terraform validate
```

No se deben commitear archivos de estado (`*.tfstate`), planes (`*.tfplan`),
`terraform.tfvars` reales ni `.terraform/` — ver `.gitignore` en la raíz del
repositorio (sí se versionan los `terraform.tfvars.example`).
