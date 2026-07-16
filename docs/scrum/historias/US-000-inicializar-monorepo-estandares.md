# US-000 — Inicializar monorepo y estándares de desarrollo

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-000                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | DevOps                                                                |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Crítica                                                               |
| Estimación relativa | 5                                                                     |
| Dependencias        | Ninguna                                                               |

## Objetivo

Inicializar el monorepo de Activa Club con la estructura de carpetas acordada, el gestor de paquetes/workspaces y los estándares de desarrollo (linting, formato, TypeScript estricto, convención de commits) para que todos los equipos trabajen sobre una base consistente.

## Entregable

Repositorio monorepo funcional con estructura conceptual, configuración base de calidad y scripts de arranque documentados.

## Valor de negocio

Una base común elimina configuraciones divergentes entre equipos y reduce fricción al integrar frontend, backend, shared-types e infraestructura.

## Criterios de aceptación

1. El monorepo contiene la estructura conceptual acordada: `apps/web`, `apps/api`, `packages/shared-types`, `packages/validation`, `packages/ui`, `infrastructure/terraform`, `docs/*`, `mock-data`.
2. Está configurado el gestor de workspaces del monorepo.
3. ESLint, Prettier y TypeScript en modo estricto están configurados a nivel raíz y son heredables por los paquetes.
4. Existen scripts para instalar dependencias y ejecutar lint y formato.
5. Conventional Commits está documentado como convención obligatoria.
6. Un desarrollador nuevo puede clonar, instalar y ejecutar los scripts de calidad siguiendo el README.
7. No se incluye funcionalidad de negocio.

## Notas / Reglas relacionadas

- Coherente con la estructura conceptual del monorepo y las normas de ingeniería del Contexto Maestro.
- Las decisiones técnicas de herramientas específicas las lidera DevOps; este documento no las prescribe.

## Trazabilidad

- Épica: EP-01
- Habilita: US-005 (CI), US-007 (gobierno Git), y todo el desarrollo posterior.
