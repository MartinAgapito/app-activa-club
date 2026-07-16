# US-010 — Validar contratos e integración planificada

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-010                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | Integrador                                                            |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Media                                                                 |
| Estimación relativa | 5                                                                     |
| Dependencias        | US-003, US-008, US-009                                                |

## Objetivo

Validar que los contratos de API, el mapa de rutas del frontend y el diseño de módulos del backend son consistentes entre sí, cerrando la fundación con una integración planificada y sin contradicciones antes del Sprint 1.

## Entregable

Documento de validación de contratos e integración planificada (en `docs/api/` o `docs/architecture/`) que confirma la consistencia frontend-backend y lista los ajustes necesarios.

## Valor de negocio

Validar la coherencia de los contratos antes de implementar evita retrabajo y bloqueos en el Sprint 1, garantizando que el trabajo paralelo de frontend y backend converja sin sorpresas.

## Criterios de aceptación

1. Se verifica que cada ruta del frontend (US-008) que consume datos tiene un contrato de API correspondiente (US-003).
2. Se verifica que cada contrato de API (US-003) tiene un módulo backend responsable (US-009).
3. Se verifica la consistencia de request/response, tipos compartidos, roles/permisos y manejo de errores entre las tres piezas.
4. Se documentan las inconsistencias o vacíos detectados y las acciones para resolverlos.
5. Se confirma que los tipos y esquemas compartidos (`packages/shared-types`, `packages/validation`) son la única fuente de contratos entre frontend y backend.
6. El resultado deja el conjunto de contratos listo (o con lista de pendientes acotada) para iniciar el Sprint 1.
7. No incluye implementación funcional.

## Casos alternativos / excepciones

- Si se detecta un contrato faltante o ambiguo, se registra como bloqueo y se coordina con Arquitecto (US-003) antes de cerrar el Sprint 0.

## Trazabilidad

- Épica: EP-01
- Depende de: US-003, US-008, US-009
- Cierra la fundación de EP-01 y habilita el arranque paralelo del Sprint 1.
