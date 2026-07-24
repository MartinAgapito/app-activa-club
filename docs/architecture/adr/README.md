# Architecture Decision Records (ADR) — Activa Club

Registro de decisiones de arquitectura. Cada ADR documenta **contexto**,
**decisión**, **alternativas consideradas** y **consecuencias**. Una decisión
arquitectónica no se cambia sin crear o actualizar el ADR correspondiente.

## Índice

| ADR                                                            | Título                                                 | Estado   |
| -------------------------------------------------------------- | ------------------------------------------------------ | -------- |
| [ADR-0001](./ADR-0001-estrategia-entornos.md)                  | Estrategia de entornos (dev/prd)                       | Aceptado |
| [ADR-0002](./ADR-0002-autenticacion-cognito-roles.md)          | Autenticación con Cognito y roles member/admin         | Aceptado |
| [ADR-0003](./ADR-0003-dynamodb-single-table.md)                | DynamoDB single-table design                           | Aceptado |
| [ADR-0004](./ADR-0004-api-gateway-rest-lambda-por-endpoint.md) | API Gateway REST + Lambda por endpoint                 | Aceptado |
| [ADR-0005](./ADR-0005-s3-migracion-activos-hosting.md)         | S3 para migración, activos y hosting del SPA           | Aceptado |
| [ADR-0006](./ADR-0006-ses-correos-transaccionales.md)          | SES para correos transaccionales                       | Aceptado |
| [ADR-0007](./ADR-0007-culqi-sandbox-idempotencia-pagos.md)     | Culqi sandbox e idempotencia de pagos                  | Aceptado |
| [ADR-0008](./ADR-0008-observabilidad-logging-auditoria.md)     | Manejo de errores, logging, auditoría y observabilidad | Aceptado |

## Plantilla

```markdown
# ADR-XXXX — Título

- **Estado**: Propuesto | Aceptado | Reemplazado por ADR-YYYY | Obsoleto
- **Fecha**: AAAA-MM-DD
- **Decisores**: Arquitecto (rol)
- **Historia relacionada**: US-XXX

## Contexto

Problema, fuerzas y restricciones (referencia a reglas de negocio si aplica).

## Decisión

Qué se decide y por qué.

## Alternativas consideradas

Opciones evaluadas y por qué se descartaron.

## Consecuencias

Positivas, negativas y su impacto en frontend/backend/Terraform/QA/CI-CD.
```
