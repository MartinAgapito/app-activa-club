# US-054 — Provisionar endpoints e infraestructura de dashboards

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-054                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Tarea técnica                                    |
| Responsable         | DevOps                                           |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Crítica                                          |
| Estimación relativa | 2                                                |
| Dependencias        | —                                                |

## Objetivo

Provisionar en Terraform los dos endpoints de dashboards (API Gateway + Lambda, log group y alarmas) con su autorización por rol y permisos de solo lectura, para que backend y frontend integren los dashboards contra `dev` desde el primer día del sprint.

## Entregable

Instanciación de `modules/endpoint` en `infrastructure/terraform/environments/dev/` para `docs/api/contratos-api.md` §9. No incluye lógica de negocio (US-055, US-057 y US-058).

## Endpoints en alcance de esta historia

- `GET /dashboard/member` (member)
- `GET /dashboard/admin` (admin)

## Valor de negocio

Sin estos endpoints desplegados, el Home del socio y el dashboard del administrador, que hoy son pantallas "en construcción", no pueden integrarse ni demostrarse.

## Reglas de negocio

Habilita RN-ANL-01..08, RN-ADM-08 y el dashboard del socio (Contexto Maestro, "Dashboard del socio").

## Precondiciones

- Base de infraestructura de `dev` desplegada (Sprints 0 a 4).

## Postcondiciones

- Los dos endpoints existen con su autorización y su Lambda.

## Criterios de aceptación

1. Los dos endpoints existen en API Gateway con método, ruta y Lambda coherentes con el contrato §9.
2. `GET /dashboard/member` no es alcanzable con un token `admin` y `GET /dashboard/admin` no es alcanzable con un token `member` (403); ninguno es público (401 sin token).
3. Las Lambdas tienen **solo permisos de lectura** (`GetItem`, `Query`) sobre la tabla y los índices que consultan: GSI1 (reservas del socio, resolver socio por `cognitoSub`), GSI2 (conteos por estado) y GSI3 (reservas por recurso y fecha, solo la del administrador). Ninguna puede escribir.
4. `GET /dashboard/admin` tiene un tiempo máximo de ejecución suficiente para recorrer el catálogo de diez recursos y los conteos por estado del volumen mock, documentado en el PR.
5. Log group con retención y alarmas según ADR-0008.
6. Todo en Terraform, desplegado por GitHub Actions con OIDC; `terraform plan` no recrea recursos de las épicas anteriores; el stage queda redesplegado y CloudFront sigue sirviendo `/api/*`.
7. Sin recursos siempre encendidos; dentro de la capa gratuita.
8. Sin lógica de negocio: las Lambdas pueden quedar con el placeholder hasta que las reemplacen sus historias.

## Casos alternativos / excepciones

- Si el rol de despliegue de CI necesita permisos nuevos, se aplica `bootstrap` antes de mergear (`docs/deployment/despliegue-dev.md`).

## Historial de cambios

- 2026-10-12: Infraestructura desplegada en `dev` por Terraform (PR de US-054), pendiente lógica: los dos endpoints responden 501 con el placeholder hasta US-055, US-057 y US-058; IAM de solo lectura con índices explícitos y `dashboard-admin` con 29 s y 512 MB. Detalle en `docs/deployment/terraform-infraestructura.md` sección 13. Verificación en `dev` tras el despliegue.

## Sugerencia de pruebas funcionales

- Sin token → 401; token cruzado → 403 en ambos endpoints.
- `terraform plan` sin cambios tras `apply`.

## Trazabilidad

- Épica: EP-07
- Reglas: habilita RN-ANL-01..08, RN-ADM-08.
- Casos de prueba: AD-06, AD-07; DA-01..DA-09 habilitados.
- Depende de: — (base desplegada).
- Habilita: US-055, US-057, US-058.
