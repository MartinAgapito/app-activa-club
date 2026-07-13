# ADR-0004 — API Gateway REST + Lambda por endpoint

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002, US-003

## Contexto

El backend es Node.js/TypeScript sobre AWS Lambda, expuesto por Amazon API
Gateway en estilo REST (Contexto Maestro). Hay que decidir la granularidad de las
funciones: una Lambda monolítica que enruta internamente vs. una Lambda por
endpoint.

## Decisión

**API Gateway REST** + **una función Lambda por endpoint** (single-purpose
handlers).

- Cada ruta+verbo (p. ej. `POST /reservations`) mapea a una Lambda dedicada con
  responsabilidad única.
- El **Cognito Authorizer** de API Gateway valida el JWT antes de invocar la
  Lambda; cada handler aplica la autorización de rol declarada en el contrato.
- Los handlers comparten utilidades vía módulos internos de `apps/api`
  (validación con `packages/validation`, acceso a datos, respuesta de error
  estándar), pero se despliegan como funciones independientes.
- Permisos IAM de **mínimo privilegio por función** (solo las acciones DynamoDB/
  SES/S3/Cognito que necesita).

Justificación de Lambda por endpoint:

1. **Mínimo privilegio real**: cada función solo obtiene los permisos que usa.
2. **Aislamiento de fallos y despliegue**: un cambio en reservas no arriesga
   pagos; arranques en frío no se comparten entre dominios.
3. **Observabilidad**: métricas y logs por endpoint sin instrumentación extra.
4. **Simplicidad de código**: handlers pequeños y testeables, sin router propio.

## Alternativas consideradas

- **Lambda monolítica (un handler + router tipo Express/Lambdalith)**: menos
  funciones que gestionar y despliegue más simple, pero concentra permisos IAM
  (mayor superficie), mezcla dominios y complica el mínimo privilegio. Aceptable
  para prototipos, pero se prefiere el aislamiento. Rechazada para el MVP.
- **HTTP API (API Gateway v2)**: más barata y simple que REST, pero el Contexto
  Maestro fija estilo **REST** (API Gateway REST) y su integración con Cognito
  Authorizer y validación de request es la esperada. Se respeta lo acordado.
- **AppSync/GraphQL**: fuera del stack acordado. Rechazada.

## Consecuencias

- **Positivas**: seguridad por mínimo privilegio, aislamiento, observabilidad
  natural, código simple y testeable.
- **Negativas**: más funciones que declarar en Terraform; se mitiga con un módulo
  Terraform parametrizado que genera Lambda + integración + permisos por endpoint.
  Posibles arranques en frío por función; irrelevante para el volumen del MVP.
- **Impacto**:
  - *Backend (US-009)*: estructura `apps/api` con un handler por endpoint y
    utilidades compartidas.
  - *Terraform (US-004)*: módulo reutilizable "endpoint" (Lambda + ruta + método
    + authorizer + rol IAM).
  - *Contratos (US-003)*: cada endpoint de [contratos-api.md](../../api/contratos-api.md)
    corresponde a una Lambda.
  - *CI/CD (US-005)*: build/empaquetado por función.
