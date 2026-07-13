# EP-01 — Base cloud, arquitectura, DevOps y gobernanza del proyecto

| Campo | Valor |
|-------|-------|
| ID | EP-01 |
| Tipo | Épica |
| Fase | MVP — Fundación |
| Estado | En progreso |
| Dependencias | Ninguna |
| Sprint principal | Sprint 0 |

## Descripción

Establecer las bases técnicas, documentales y de gobernanza de Activa Club: monorepo, arquitectura, modelo de datos y contratos iniciales, infraestructura como código con Terraform, pipeline de CI de calidad, gobierno Git y estrategia de pruebas. Esta épica no entrega funcionalidad de negocio; habilita que las épicas funcionales puedan desarrollarse en paralelo (frontend y backend) sobre una base sólida y trazable.

## Valor de negocio

Sin una base común (estructura del monorepo, contratos, estándares de calidad y pipeline), el trabajo paralelo de los equipos genera retrabajo, inconsistencias y decisiones ad hoc. EP-01 reduce el riesgo de integración, asegura trazabilidad extremo a extremo y protege la coherencia con el Contexto Maestro.

## Objetivos de la épica

- Monorepo inicializado con estándares de desarrollo y calidad.
- Visión, alcance y reglas de negocio documentados para todo el equipo.
- Arquitectura base, ADRs y decisiones técnicas registradas.
- Modelo de datos y contratos iniciales definidos para habilitar trabajo paralelo.
- Base de infraestructura Terraform con OIDC hacia AWS.
- CI de calidad operativo en GitHub Actions.
- Estrategia y matriz inicial de pruebas.
- Gobierno Git y plantillas de Pull Request.
- Mapa de rutas y design foundation del frontend.
- Diseño de módulos backend y flujo de migración.
- Contratos e integración planificada validados.

## Historias asociadas

| ID | Título | Responsable | Depende de |
|----|--------|-------------|------------|
| [US-000](../historias/US-000-inicializar-monorepo-estandares.md) | Inicializar monorepo y estándares de desarrollo | DevOps | — |
| [US-001](../historias/US-001-documentar-vision-alcance-reglas.md) | Documentar visión, alcance y reglas de negocio | Scrum/Product | — |
| [US-002](../historias/US-002-documentar-arquitectura-base.md) | Documentar arquitectura base y decisiones técnicas | Arquitecto | US-001 |
| [US-003](../historias/US-003-modelo-datos-contratos-iniciales.md) | Definir modelo de datos y contratos iniciales | Arquitecto | US-001 |
| [US-004](../historias/US-004-base-infraestructura-terraform.md) | Preparar base de infraestructura con Terraform | DevOps | US-002 |
| [US-005](../historias/US-005-ci-calidad-github-actions.md) | Configurar CI de calidad con GitHub Actions | DevOps | US-000 |
| [US-006](../historias/US-006-estrategia-matriz-pruebas.md) | Definir estrategia y matriz inicial de pruebas | QA | US-001, US-003 |
| [US-007](../historias/US-007-gobierno-git-plantillas-pr.md) | Definir gobierno Git y plantillas de Pull Request | Git Steward | US-000 |
| [US-008](../historias/US-008-mapa-rutas-design-foundation.md) | Diseñar mapa de rutas y design foundation | Frontend | US-001, US-003 |
| [US-009](../historias/US-009-modulos-backend-flujo-migracion.md) | Diseñar módulos backend y flujo de migración | Backend | US-002, US-003 |
| [US-010](../historias/US-010-validar-contratos-integracion.md) | Validar contratos e integración planificada | Integrador | US-003, US-008, US-009 |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- Un desarrollador puede clonar el monorepo, instalar dependencias y ejecutar lint, formato y pruebas en verde.
- Existen artefactos de producto (visión, alcance, reglas), arquitectura (ADRs, modelo de datos, contratos) y gobernanza (Git, PR, CI).
- Frontend y backend pueden arrancar el Sprint 1 sin bloqueos de fundación.

## Épicas funcionales siguientes (referencia, no parte de EP-01)

Estas se detallarán en sprints posteriores; se listan para dar contexto de destino:

- EP-02 — Migración on-premise y datos operativos.
- EP-03 — Activación, registro y autenticación.
- EP-04 — Membresías y pagos.
- EP-05 — Reservas de instalaciones.
- EP-06 — Notificaciones.
- EP-07 — Administración.
- EP-08 — Dashboards y analytics.

## Historial de cambios

- 2026-07-09: Creación de la épica y asociación de historias del Sprint 0 (US-001).
