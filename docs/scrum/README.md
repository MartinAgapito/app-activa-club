# docs/scrum — Product Backlog de Activa Club

Épicas, historias de usuario, sprints y definiciones Scrum del proyecto Activa Club.

Toda funcionalidad implementada debe partir de una historia de usuario aprobada aquí, con criterios de aceptación verificables, manteniendo trazabilidad entre épica, historia, tarea, código, pruebas y Pull Request (ver `docs/product/contexto-maestro.md`, sección "Metodología Scrum"). El Contexto Maestro es la fuente única de verdad; estos artefactos lo traducen en trabajo accionable.

## Documentos de gobernanza Scrum

- [Definition of Ready (DoR)](./definition-of-ready.md)
- [Definition of Done (DoD)](./definition-of-done.md)

## Documentos de producto relacionados

- [Visión y objetivos](../product/vision-y-objetivos.md)
- [Matriz de alcance (MVP / fase posterior / fuera de alcance)](../product/matriz-de-alcance.md)
- [Reglas de negocio por módulo](../product/reglas-de-negocio.md)

## Épicas

| ID                                                                   | Título                                                     | Fase            | Estado      |
| -------------------------------------------------------------------- | ---------------------------------------------------------- | --------------- | ----------- |
| [EP-01](./epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) | Base cloud, arquitectura, DevOps y gobernanza del proyecto | MVP — Fundación | En progreso |
| [EP-02](./epicas/EP-02-migracion-activacion-acceso.md)               | Migración de socios, activación y acceso                   | MVP             | Planificada |
| EP-03                                                                | Membresías y pagos                                         | MVP             | Planificada |
| EP-04                                                                | Reservas de instalaciones                                  | MVP             | Planificada |
| EP-05                                                                | Notificaciones                                             | MVP             | Planificada |
| EP-06                                                                | Administración                                             | MVP             | Planificada |
| EP-07                                                                | Dashboards y analytics                                     | MVP             | Planificada |

## Sprints

| Sprint                            | Nombre                                   | Épica | Estado      |
| --------------------------------- | ---------------------------------------- | ----- | ----------- |
| [Sprint 0](./sprints/sprint-0.md) | Fundación técnica y documental           | EP-01 | En progreso |
| [Sprint 1](./sprints/sprint-1.md) | Migración de socios, activación y acceso | EP-02 | Planificada |

## Historias del Sprint 0 (EP-01)

| ID                                                               | Título                                             | Responsable   | Prioridad  | Depende de             |
| ---------------------------------------------------------------- | -------------------------------------------------- | ------------- | ---------- | ---------------------- |
| [US-000](./historias/US-000-inicializar-monorepo-estandares.md)  | Inicializar monorepo y estándares de desarrollo    | DevOps        | Crítica    | —                      |
| [US-001](./historias/US-001-documentar-vision-alcance-reglas.md) | Documentar visión, alcance y reglas de negocio     | Scrum/Product | Crítica    | —                      |
| [US-002](./historias/US-002-documentar-arquitectura-base.md)     | Documentar arquitectura base y decisiones técnicas | Arquitecto    | Alta       | US-001                 |
| [US-003](./historias/US-003-modelo-datos-contratos-iniciales.md) | Definir modelo de datos y contratos iniciales      | Arquitecto    | Alta       | US-001                 |
| [US-004](./historias/US-004-base-infraestructura-terraform.md)   | Preparar base de infraestructura con Terraform     | DevOps        | Alta       | US-002                 |
| [US-005](./historias/US-005-ci-calidad-github-actions.md)        | Configurar CI de calidad con GitHub Actions        | DevOps        | Alta       | US-000                 |
| [US-006](./historias/US-006-estrategia-matriz-pruebas.md)        | Definir estrategia y matriz inicial de pruebas     | QA            | Media-Alta | US-001, US-003         |
| [US-007](./historias/US-007-gobierno-git-plantillas-pr.md)       | Definir gobierno Git y plantillas de Pull Request  | Git Steward   | Media-Alta | US-000                 |
| [US-008](./historias/US-008-mapa-rutas-design-foundation.md)     | Diseñar mapa de rutas y design foundation          | Frontend      | Media      | US-001, US-003         |
| [US-009](./historias/US-009-modulos-backend-flujo-migracion.md)  | Diseñar módulos backend y flujo de migración       | Backend       | Media      | US-002, US-003         |
| [US-010](./historias/US-010-validar-contratos-integracion.md)    | Validar contratos e integración planificada        | Integrador    | Media      | US-003, US-008, US-009 |

## Historias del Sprint 1 (EP-02)

| ID                                                                     | Título                                                 | Responsable        | Prioridad | Depende de     |
| ---------------------------------------------------------------------- | ------------------------------------------------------ | ------------------ | --------- | -------------- |
| [US-011](./historias/US-011-provisionar-endpoints-identidad-acceso.md) | Provisionar endpoints serverless de identidad y acceso | DevOps             | Crítica   | —              |
| [US-012](./historias/US-012-migracion-inicial-socios-dynamodb.md)      | Ejecutar la migración inicial de socios hacia DynamoDB | Backend            | Crítica   | US-011         |
| [US-013](./historias/US-013-activacion-cuenta-socio-dni.md)            | Activar cuenta de socio migrado con DNI                | Backend + Frontend | Alta      | US-011, US-012 |
| [US-014](./historias/US-014-login-correo-contrasena.md)                | Iniciar sesión con correo y contraseña                 | Frontend           | Alta      | —              |
| [US-015](./historias/US-015-recuperacion-contrasena.md)                | Recuperar contraseña                                   | Frontend           | Media     | US-014         |
| [US-016](./historias/US-016-registro-socio-nuevo.md)                   | Registrarse como socio nuevo                           | Backend + Frontend | Alta      | US-011         |
| [US-017](./historias/US-017-aprobacion-rechazo-socios.md)              | Aprobar o rechazar solicitudes de socios nuevos        | Backend + Frontend | Alta      | US-011, US-016 |
| [US-018](./historias/US-018-perfil-usuario.md)                         | Consultar y actualizar el perfil de usuario            | Backend + Frontend | Media     | US-011         |

## Convenciones de trazabilidad

- Épica: `EP-NN`
- Historia / tarea técnica: `US-NNN`
- Regla de negocio: `RN-<MODULO>-NN` (ver [reglas de negocio](../product/reglas-de-negocio.md))
- Trazabilidad esperada: épica → historia → criterios de aceptación → pruebas → Pull Request.

## Historial de cambios

- 2026-07-09: Creación del backlog inicial, EP-01 y Sprint 0 (US-001).
- 2026-07-16: Creación de EP-02 y Sprint 1 con las historias US-011..US-018; renumeración de las épicas funcionales siguientes.
