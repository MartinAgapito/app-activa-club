# US-011 — Provisionar endpoints serverless de identidad y acceso

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-011                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Tarea técnica                                           |
| Responsable         | DevOps                                                  |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Crítica                                                 |
| Estimación relativa | 8                                                       |
| Dependencias        | —                                                       |

## Objetivo

Provisionar en Terraform la infraestructura de endpoints serverless (API Gateway + Lambda por endpoint, log groups y autorización Cognito) necesaria para los flujos de identidad y acceso de EP-02, siguiendo el comentario dejado en `infrastructure/terraform/environments/dev/main.tf` y el módulo `modules/endpoint`, de modo que backend y frontend puedan integrar contra endpoints reales del ambiente `dev`.

## Entregable

Instanciación del módulo `modules/endpoint` (más `modules/log-group` y alarmas asociadas, ADR-0008) en `infrastructure/terraform/environments/dev/` para los endpoints de EP-02 definidos en `docs/api/contratos-api.md`, con el Cognito Authorizer cableado por rol. No incluye la lógica de negocio de las Lambdas (la implementan las historias de backend).

## Endpoints en alcance de esta historia

- `POST /activation/verify` (Público)
- `POST /activation/complete` (Público)
- `POST /registration` (Público)
- `GET /members/me` (member) y `PATCH /members/me` (member)
- `GET /members` (admin), `GET /members/{memberId}` (admin)
- `POST /members/{memberId}/approve` (admin), `POST /members/{memberId}/reject` (admin)
- `POST /admin/migration/run` (admin)

## Valor de negocio

Sin la infraestructura de API desplegada, ninguna historia funcional de EP-02 puede integrarse ni demostrarse extremo a extremo. Esta historia desbloquea el trabajo paralelo del backend (lógica) y del frontend (integración) sobre el ambiente `dev` real, cumpliendo la norma de que toda infraestructura AWS vive en Terraform.

## Criterios de aceptación

1. Cada endpoint listado en el alcance existe en API Gateway con su método, ruta y Lambda asociada, coherente con `docs/api/contratos-api.md`.
2. La autorización por endpoint respeta la columna "Auth" del contrato (`Público`, `member`, `admin`) usando el Cognito Authorizer y el claim `cognito:groups` (ADR-0002).
3. Cada Lambda tiene su log group y las alarmas previstas por ADR-0008.
4. La configuración se define exclusivamente en Terraform; no requiere cambios manuales en la consola AWS.
5. El despliegue se realiza mediante GitHub Actions con OIDC, sin claves AWS estáticas.
6. El plan/aplicación de Terraform se ejecuta sobre `environments/dev` sin romper los recursos base ya desplegados (DynamoDB, Cognito, S3, CloudFront, SES).
7. La solución respeta el presupuesto AWS Free Tier (sin recursos innecesarios ni siempre-encendidos).
8. No se implementa lógica de negocio en esta historia; las Lambdas pueden entregar un stub temporal reemplazado por las historias de backend.

## Casos alternativos / excepciones

- Si el módulo `modules/endpoint` requiere ajustes para soportar rutas con path parameters (`{memberId}`) o autorizadores mixtos, se documenta el cambio del módulo antes de aplicarlo.
- Si un endpoint depende de permisos IAM hacia DynamoDB/Cognito/SES, se otorgan con mínimo privilegio en Terraform.

## Trazabilidad

- Épica: EP-02
- Reglas: habilita RN-ACT-01..07, RN-MIG-01..06, RN-ADM-01/02/03.
- Depende de: — (base de EP-01/Sprint 0 desplegada).
- Habilita: US-012, US-013, US-016, US-017, US-018.
