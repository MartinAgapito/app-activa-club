# US-004 — Preparar base de infraestructura con Terraform

| Campo | Valor |
|-------|-------|
| ID | US-004 |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo | Tarea técnica |
| Responsable | DevOps |
| Fase | MVP — Fundación |
| Sprint | Sprint 0 |
| Prioridad | Alta |
| Estimación relativa | 8 |
| Dependencias | US-002 |

## Objetivo

Preparar la base de infraestructura como código en Terraform: estructura de módulos, backend de estado remoto, gestión de entornos y configuración de OIDC para GitHub Actions hacia AWS, sin desplegar aún recursos funcionales de negocio.

## Entregable

Base de Terraform en `infrastructure/terraform/` con estructura de módulos, estado remoto, variables por entorno y rol/OIDC para CI, documentada en `docs/deployment/`.

## Valor de negocio

Toda infraestructura AWS debe existir en Terraform sin cambios manuales en consola. Sentar la base ahora evita improvisación y garantiza reproducibilidad y seguridad desde el inicio.

## Criterios de aceptación

1. Existe la estructura base de Terraform con organización de módulos coherente con la arquitectura de US-002.
2. Está configurado el backend de estado remoto y la estrategia de entornos.
3. Está configurada la autenticación OIDC de GitHub Actions hacia AWS (sin claves estáticas).
4. `terraform validate` y `terraform plan` se ejecutan sin errores sobre la base.
5. No se requieren cambios manuales en la consola de AWS para operar la base.
6. La guía de despliegue y entornos queda documentada en `docs/deployment/`.
7. No se despliegan aún recursos de funcionalidad de negocio.

## Casos alternativos / excepciones

- Si la creación del bootstrap del estado remoto requiere un paso inicial fuera de Terraform, se documenta explícitamente como excepción justificada.

## Trazabilidad

- Épica: EP-01
- Depende de: US-002
- Habilita: despliegues de infraestructura funcional en sprints posteriores.
