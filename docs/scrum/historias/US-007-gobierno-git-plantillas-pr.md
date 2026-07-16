# US-007 — Definir gobierno Git y plantillas de Pull Request

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-007                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | Git Steward                                                           |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Media-Alta                                                            |
| Estimación relativa | 3                                                                     |
| Dependencias        | US-000                                                                |

## Objetivo

Definir el gobierno de Git del proyecto (estrategia de ramas, convención de commits, reglas de protección de rama, política de revisión) y las plantillas de Pull Request e Issues que aseguran trazabilidad épica → historia → PR.

## Entregable

Reglas de gobierno Git documentadas y plantillas en `.github/` (Pull Request e Issues), coherentes con Conventional Commits.

## Valor de negocio

Un gobierno Git claro asegura trazabilidad, revisiones consistentes y protección de la rama principal, condiciones necesarias para el trabajo paralelo y la Definition of Done.

## Criterios de aceptación

1. Existe una estrategia de ramas documentada (por ejemplo, ramas por historia y merge vía PR).
2. Conventional Commits está definido como convención obligatoria con ejemplos.
3. Existe una plantilla de Pull Request que exige referenciar la historia (US-*), la épica y los criterios de aceptación cubiertos.
4. La plantilla de PR incluye checklist de Definition of Done.
5. Existen plantillas de Issue para historia de usuario, tarea técnica y bug.
6. Se documentan las reglas de protección de la rama principal (revisión requerida y checks de CI obligatorios de US-005).
7. Es coherente con la estructura del monorepo (US-000).

## Casos alternativos / excepciones

- Hotfixes urgentes: definir el flujo excepcional manteniendo revisión posterior y trazabilidad.

## Trazabilidad

- Épica: EP-01
- Depende de: US-000
- Se relaciona con: US-005 (checks requeridos en PR).
