# ADR-0001 — Estrategia de entornos (dev/demo)

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002

## Contexto

El MVP se presentará a un jurado con pocos usuarios. Se necesita un entorno de
trabajo diario y un entorno estable para la demostración, sin incurrir en el
costo ni la complejidad de una matriz completa dev/qa/staging/prod. Toda la
infraestructura debe ser reproducible con Terraform (sin cambios manuales).

## Decisión

Se adoptan **dos entornos**: `dev` y `demo`.

- Cada entorno es un conjunto de recursos AWS aislado por **prefijo de nombre**
  (`activa-club-<env>-...`) y por workspace/variables de Terraform.
- Los servicios usados (DynamoDB on-demand, Lambda, API Gateway, Cognito, S3,
  SES en sandbox, CloudWatch) tienen costo cercano a cero en reposo, por lo que
  mantener dos entornos no impacta significativamente el presupuesto.
- La configuración específica por entorno (nombres de recursos, dominios, IDs de
  Cognito, claves públicas de Culqi sandbox) se inyecta por **variables de
  entorno** y parámetros de Terraform; los secretos viven en SSM Parameter Store
  / Secrets Manager, nunca en el repositorio.
- `demo` se despliega desde la rama principal ya validada; `dev` puede recibir
  despliegues frecuentes.

## Alternativas consideradas

- **Un solo entorno**: más barato aún, pero un despliegue roto en `dev` dejaría
  sin demo al jurado. Rechazado por riesgo.
- **Tres o más entornos (dev/staging/prod)**: sobrearquitectura para el alcance
  y la duración del proyecto. Rechazado por complejidad y esfuerzo de CI/CD.

## Consecuencias

- **Positivas**: aislamiento entre trabajo diario y demo; despliegues seguros;
  costo marginal casi nulo.
- **Negativas**: se duplican algunos recursos y la parametrización de Terraform
  debe soportar el prefijo por entorno desde el inicio.
- **Impacto**:
  - *Terraform (US-004)*: variable `environment` y prefijo de nombres; backend de
    estado separado por entorno.
  - *CI/CD (US-005)*: dos jobs/targets de despliegue; OIDC con roles por entorno.
  - *Backend/Frontend*: leen configuración por entorno desde variables; no
    hardcodear IDs.
  - *QA*: pruebas E2E se ejecutan contra `dev`; smoke test contra `demo`.
