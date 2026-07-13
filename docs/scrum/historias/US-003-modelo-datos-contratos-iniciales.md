# US-003 — Definir modelo de datos y contratos iniciales

| Campo | Valor |
|-------|-------|
| ID | US-003 |
| Épica | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo | Tarea técnica |
| Responsable | Arquitecto |
| Fase | MVP — Fundación |
| Sprint | Sprint 0 |
| Prioridad | Alta |
| Estimación relativa | 8 |
| Dependencias | US-001 |

## Objetivo

Definir el modelo de datos inicial en DynamoDB (entidades, atributos, claves, índices) y los contratos de API iniciales (endpoints, request/response, errores) que habilitan el trabajo paralelo de frontend y backend, además del diccionario de datos y el mapeo de migración desde el JSON on-premise.

## Entregable

Modelo de datos en `docs/data/`, contratos de API en `docs/api/` y tipos/esquemas compartidos previstos en `packages/shared-types` y `packages/validation` (definición, no implementación funcional).

## Valor de negocio

Los contratos y el modelo de datos son la interfaz que permite a frontend y backend avanzar en paralelo sin bloquearse ni inventar estructuras, cumpliendo la norma de "documentar contratos antes de implementar integración".

## Criterios de aceptación

1. Existe un modelo de datos para las entidades del MVP: socios, membresías, pagos, reservas, participantes/invitados, recursos, notificaciones.
2. El modelo respeta las reglas de negocio de `docs/product/reglas-de-negocio.md` (estados, aforos, deuda, identificador legado).
3. Existe el mapeo de migración desde el JSON on-premise hacia DynamoDB, incluyendo socios, membresías, saldo pendiente resumido y estado legado, con identificador legado.
4. Existe un diccionario de datos con los atributos y sus significados.
5. Existen contratos de API iniciales para los flujos del MVP (activación, registro, login, pagos, reservas, notificaciones, administración), con formato de request/response y manejo de errores.
6. Los contratos definen roles/permisos por endpoint (`member` / `admin`).
7. No se inventan tablas, atributos, índices, endpoints o contratos fuera de las reglas de negocio acordadas.
8. No incluye implementación funcional; solo definición.

## Casos alternativos / excepciones

- Si una regla de negocio no puede modelarse sin ambigüedad, se escala a Product (US-001) para aclararla antes de fijar el contrato.

## Trazabilidad

- Épica: EP-01
- Depende de: US-001
- Habilita: US-006 (matriz de pruebas), US-008 (frontend), US-009 (backend), US-010 (validación de contratos).
