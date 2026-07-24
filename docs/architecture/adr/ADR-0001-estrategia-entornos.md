# ADR-0001 — Estrategia de entornos (dev/prd)

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

Se adoptan **dos entornos**: `dev` y `prd`.

> `prd` es el **identificador** del entorno estable (alineado con el nombre ya
> usado en la cuenta AWS real). Conceptualmente sigue siendo el entorno estable
> para la demostración ante el jurado, no un entorno de producción tradicional:
> no implica SLA, on-call ni la carga operativa de un sistema con usuarios reales
> a gran escala. El alcance y el razonamiento de este ADR no cambian por el
> nombre; ver la _Nota de actualización_ al final.

- Cada entorno es un conjunto de recursos AWS aislado por **prefijo de nombre**
  (`activa-club-<env>-...`) y por workspace/variables de Terraform.
- Los servicios usados (DynamoDB on-demand, Lambda, API Gateway, Cognito, S3,
  SES en sandbox, CloudWatch) tienen costo cercano a cero en reposo, por lo que
  mantener dos entornos no impacta significativamente el presupuesto.
- La configuración específica por entorno (nombres de recursos, dominios, IDs de
  Cognito, claves públicas de Culqi sandbox) se inyecta por **variables de
  entorno** y parámetros de Terraform; los secretos viven en SSM Parameter Store
  / Secrets Manager, nunca en el repositorio.
- `prd` se despliega desde la rama principal ya validada; `dev` puede recibir
  despliegues frecuentes.

## Alternativas consideradas

- **Un solo entorno**: más barato aún, pero un despliegue roto en `dev` dejaría
  sin demo al jurado. Rechazado por riesgo.
- **Tres o más entornos (dev/staging/prod)**: sobrearquitectura para el alcance
  y la duración del proyecto. Rechazado por complejidad y esfuerzo de CI/CD.

## Consecuencias

- **Positivas**: aislamiento entre el trabajo diario (`dev`) y el entorno estable
  (`prd`); despliegues seguros; costo marginal casi nulo.
- **Negativas**: se duplican algunos recursos y la parametrización de Terraform
  debe soportar el prefijo por entorno desde el inicio.
- **Impacto**:
  - _Terraform (US-004)_: variable `environment` y prefijo de nombres; backend de
    estado separado por entorno.
  - _CI/CD (US-005)_: dos jobs/targets de despliegue; OIDC con roles por entorno.
  - _Backend/Frontend_: leen configuración por entorno desde variables; no
    hardcodear IDs.
  - _QA_: pruebas E2E se ejecutan contra `dev`; smoke test contra `prd`.

## Nota de actualización — 2026-07-24

Por decisión del propietario del proyecto, el **identificador** del entorno
estable pasa de `demo` a `prd`, para alinearse con el nombre que ya se usa en la
cuenta AWS real. Este cambio es únicamente de **nombre**: no modifica el alcance,
los dos entornos, la parametrización por prefijo ni el razonamiento original de
la decisión. El entorno `prd` sigue siendo el entorno estable para la
demostración ante el jurado y **no** adopta la carga operativa de un producción
tradicional (SLA, on-call, alta disponibilidad para usuarios reales a gran
escala). Cualquier referencia previa a `demo` como nombre de entorno debe leerse
como `prd`.
