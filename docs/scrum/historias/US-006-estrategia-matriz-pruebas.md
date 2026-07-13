# US-006 — Definir estrategia y matriz inicial de pruebas

| Campo | Valor |
|-------|-------|
| ID | US-006 |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo | Tarea técnica |
| Responsable | QA |
| Fase | MVP — Fundación |
| Sprint | Sprint 0 |
| Prioridad | Media-Alta |
| Estimación relativa | 5 |
| Dependencias | US-001, US-003 |

## Objetivo

Definir la estrategia de pruebas del MVP (niveles, herramientas, responsabilidades) y una matriz inicial que mapee reglas de negocio y flujos críticos a tipos de prueba, para asegurar cobertura verificable desde el Sprint 1.

## Entregable

Documento de estrategia de pruebas y matriz inicial en `docs/testing/`, alineados con Vitest, React Testing Library y Playwright.

## Valor de negocio

Una estrategia de pruebas temprana asegura que las reglas críticas (aforo, cruces, deuda, cancelación 24h, aprobaciones, pagos seguros) se validen y sostiene la Definition of Done del equipo.

## Criterios de aceptación

1. Existe una estrategia de pruebas que define niveles (unitario, integración, E2E) y qué herramienta se usa en cada uno.
2. Existe una matriz inicial que mapea reglas de negocio (`RN-*`) y flujos críticos del MVP a tipos de prueba.
3. La matriz cubre al menos: migración, activación/registro, pagos, reservas (aforo, cruces, deuda, cancelación 24h, aprobación de parrillas/salón), notificaciones.
4. Se define el enfoque de datos de prueba (mock JSON on-premise, sandbox de Culqi) sin usar datos sensibles reales.
5. Se definen criterios de cobertura mínima y responsabilidades por rol (frontend, backend, QA).
6. Es coherente con las reglas de negocio (US-001) y los contratos/modelo de datos (US-003).
7. No incluye implementación de pruebas automatizadas; solo estrategia y matriz.

## Casos alternativos / excepciones

- Reglas que dependan de aprobación administrativa deben incluir casos de rechazo y expiración, no solo el camino feliz.

## Trazabilidad

- Épica: EP-01
- Depende de: US-001, US-003
- Se relaciona con: US-005 (CI ejecuta pruebas), US-010 (validación de integración).
