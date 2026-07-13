# US-002 — Documentar arquitectura base y decisiones técnicas

| Campo | Valor |
|-------|-------|
| ID | US-002 |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo | Tarea técnica |
| Responsable | Arquitecto |
| Fase | MVP — Fundación |
| Sprint | Sprint 0 |
| Prioridad | Alta |
| Estimación relativa | 8 |
| Dependencias | US-001 |

## Objetivo

Documentar la arquitectura base de Activa Club (frontend, backend serverless, autenticación, datos, mensajería, pagos, observabilidad) y registrar las decisiones técnicas como ADRs, alineadas con el stack del Contexto Maestro.

## Entregable

Documentación de arquitectura y ADRs en `docs/architecture/`, con diagrama de alto nivel y decisiones justificadas.

## Valor de negocio

Una arquitectura documentada y decisiones registradas permiten que los equipos construyan sin reinterpretar el stack y facilitan la trazabilidad de por qué se eligió cada componente.

## Criterios de aceptación

1. Existe un documento de arquitectura de alto nivel que describe cómo interactúan frontend (React/Vite), backend (Lambda/Node), API Gateway, Cognito, DynamoDB, S3, SES, Culqi sandbox y CloudWatch.
2. Existe al menos un diagrama de la arquitectura del MVP.
3. Se registran ADRs para las decisiones técnicas clave (por ejemplo: estilo REST, autenticación con Cognito, modelo serverless, Terraform, CI/CD con OIDC).
4. Cada ADR incluye contexto, decisión, alternativas consideradas y consecuencias.
5. La arquitectura respeta las normas de ingeniería: serverless, bajo costo, seguridad, sin secretos en repositorio, reglas críticas en backend.
6. Es coherente con la visión, el alcance y las reglas de negocio de US-001.
7. No incluye implementación de código.

## Casos alternativos / excepciones

- Si una decisión técnica afecta el alcance funcional, se coordina con Product (US-001) antes de fijarla.

## Trazabilidad

- Épica: EP-01
- Depende de: US-001
- Habilita: US-004 (Terraform), US-009 (módulos backend).
