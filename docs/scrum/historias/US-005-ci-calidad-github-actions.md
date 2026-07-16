# US-005 — Configurar CI de calidad con GitHub Actions

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-005                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | DevOps                                                                |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Alta                                                                  |
| Estimación relativa | 5                                                                     |
| Dependencias        | US-000                                                                |

## Objetivo

Configurar un pipeline de Integración Continua en GitHub Actions que valide la calidad del código en cada Pull Request: instalación, lint, formato, verificación de tipos y pruebas, sobre la estructura del monorepo.

## Entregable

Workflow(s) de CI en GitHub Actions que corren en Pull Request y bloquean la integración si la calidad no pasa, documentado en `docs/deployment/`.

## Valor de negocio

El CI de calidad protege la coherencia del monorepo y evita que código que no cumple estándares llegue a la rama principal, sosteniendo la Definition of Done de todo el equipo.

## Criterios de aceptación

1. Existe un workflow de GitHub Actions que se ejecuta en Pull Request hacia la rama principal.
2. El workflow instala dependencias del monorepo y ejecuta lint (ESLint), verificación de formato (Prettier), verificación de tipos (TypeScript estricto) y pruebas.
3. El workflow falla si cualquiera de esos pasos falla, bloqueando el merge.
4. El pipeline funciona sobre la estructura de workspaces del monorepo (US-000).
5. No usa claves AWS estáticas; cualquier interacción con AWS emplea OIDC.
6. El estado del CI es visible en los Pull Requests.
7. La configuración queda documentada.

## Casos alternativos / excepciones

- Si aún no existen pruebas en algún paquete, el paso de pruebas debe pasar en verde sin falsos positivos (no fallar por ausencia de tests) y quedar preparado para incorporarlas.

## Trazabilidad

- Épica: EP-01
- Depende de: US-000
- Se relaciona con: US-006 (estrategia de pruebas), US-007 (gobierno Git y checks requeridos).
