# Sprint 0 — Fundación técnica y documental

| Campo | Valor |
|-------|-------|
| Sprint | 0 |
| Nombre | Fundación técnica y documental |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Fase | MVP — Fundación |
| Duración sugerida | 1 semana (hasta 2 semanas si hay menor disponibilidad) |
| Estado | En progreso |

## Sprint Goal

Establecer las bases del monorepo, la arquitectura, la documentación Scrum, la estrategia Terraform, los estándares de calidad y el pipeline de CI, de modo que frontend y backend puedan desarrollarse en paralelo durante el Sprint 1.

## Restricción del sprint

Durante el Sprint 0 **no se incorpora funcionalidad de negocio**. Todo el trabajo es fundación técnica y documental. Cualquier historia funcional se planifica para el Sprint 1 en adelante.

## Sprint Backlog

| ID | Título | Responsable | Prioridad | Depende de | Estimación |
|----|--------|-------------|-----------|------------|------------|
| [US-000](../historias/US-000-inicializar-monorepo-estandares.md) | Inicializar monorepo y estándares de desarrollo | DevOps | Crítica | — | 5 |
| [US-001](../historias/US-001-documentar-vision-alcance-reglas.md) | Documentar visión, alcance y reglas de negocio | Scrum/Product | Crítica | — | 5 |
| [US-002](../historias/US-002-documentar-arquitectura-base.md) | Documentar arquitectura base y decisiones técnicas | Arquitecto | Alta | US-001 | 8 |
| [US-003](../historias/US-003-modelo-datos-contratos-iniciales.md) | Definir modelo de datos y contratos iniciales | Arquitecto | Alta | US-001 | 8 |
| [US-004](../historias/US-004-base-infraestructura-terraform.md) | Preparar base de infraestructura con Terraform | DevOps | Alta | US-002 | 8 |
| [US-005](../historias/US-005-ci-calidad-github-actions.md) | Configurar CI de calidad con GitHub Actions | DevOps | Alta | US-000 | 5 |
| [US-006](../historias/US-006-estrategia-matriz-pruebas.md) | Definir estrategia y matriz inicial de pruebas | QA | Media-Alta | US-001, US-003 | 5 |
| [US-007](../historias/US-007-gobierno-git-plantillas-pr.md) | Definir gobierno Git y plantillas de Pull Request | Git Steward | Media-Alta | US-000 | 3 |
| [US-008](../historias/US-008-mapa-rutas-design-foundation.md) | Diseñar mapa de rutas y design foundation | Frontend | Media | US-001, US-003 | 5 |
| [US-009](../historias/US-009-modulos-backend-flujo-migracion.md) | Diseñar módulos backend y flujo de migración | Backend | Media | US-002, US-003 | 8 |
| [US-010](../historias/US-010-validar-contratos-integracion.md) | Validar contratos e integración planificada | Integrador | Media | US-003, US-008, US-009 | 5 |

## Grafo de dependencias

```
US-000 ──► US-005
      └──► US-007

US-001 ──► US-002 ──► US-004
      │         └──► US-009
      ├──► US-003 ──► US-006
      │         ├──► US-008 ──► US-010
      │         └──► US-009 ──► US-010
      └──► US-006
US-003 ──► US-010
```

## Orden sugerido de ejecución (olas)

- **Ola 1 (sin dependencias, en paralelo):** US-000 (DevOps), US-001 (Product).
- **Ola 2 (habilitadas por Ola 1):** US-002 (Arquitecto), US-003 (Arquitecto), US-005 (DevOps), US-007 (Git Steward).
- **Ola 3:** US-004 (DevOps), US-006 (QA), US-008 (Frontend), US-009 (Backend).
- **Ola 4 (cierre de fundación):** US-010 (Integrador).

## Capacidad de trabajo paralelo

- Product y DevOps arrancan de inmediato sin bloqueos.
- Una vez cerrada US-001, el Arquitecto habilita las dos ramas (arquitectura y datos/contratos) que desbloquean a Frontend, Backend, QA y DevOps.
- El cierre de US-010 confirma que frontend y backend pueden trabajar en paralelo en el Sprint 1 sobre contratos consistentes.

## Definición de éxito del Sprint

- Todas las historias cumplen su Definition of Done.
- El monorepo está operativo con CI de calidad en verde.
- La documentación de producto, arquitectura, datos, contratos, testing, despliegue y gobernanza existe y es coherente con el Contexto Maestro.
- No se introdujo funcionalidad de negocio.
- El Sprint 1 puede iniciarse sin bloqueos de fundación.

## Ceremonias

- **Planning:** selección de las 11 historias de fundación y confirmación del Sprint Goal.
- **Daily:** sincronización breve; foco en desbloquear dependencias entre olas.
- **Review:** demostración de la base (monorepo, CI, documentación, base Terraform).
- **Retrospective:** ajustes de proceso antes de arrancar el Sprint 1 funcional.

## Riesgos del sprint

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Contratos/modelo de datos ambiguos (US-003) | Alto: bloquea frontend, backend, QA | Priorizar US-001 y US-003; US-010 valida antes del Sprint 1 |
| Configuración de OIDC AWS demora (US-004/US-005) | Medio: retrasa CI/CD | Aislar OIDC como tarea temprana de DevOps |
| Menor disponibilidad del equipo | Medio: extiende el sprint | Duración flexible hasta 2 semanas; mantener el alcance sin funcionalidad |
| Divergencia respecto al Contexto Maestro | Alto: retrabajo y decisiones inconsistentes | Toda la documentación deriva del Contexto Maestro; el guardián de contexto vela por su integridad |

## Historial de cambios

- 2026-07-09: Creación del Sprint 0 con las 11 historias de fundación (US-001, EP-01).
