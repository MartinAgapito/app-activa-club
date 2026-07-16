# US-009 — Diseñar módulos backend y flujo de migración

| Campo               | Valor                                                                 |
| ------------------- | --------------------------------------------------------------------- |
| ID                  | US-009                                                                |
| Épica               | [EP-01](../epicas/EP-01-base-cloud-arquitectura-devops-gobernanza.md) |
| Tipo                | Tarea técnica                                                         |
| Responsable         | Backend                                                               |
| Fase                | MVP — Fundación                                                       |
| Sprint              | Sprint 0                                                              |
| Prioridad           | Media                                                                 |
| Estimación relativa | 8                                                                     |
| Dependencias        | US-002, US-003                                                        |

## Objetivo

Diseñar la organización de los módulos del backend serverless (estructura de funciones Lambda, capas, validación, autorización por rol, logging) y el flujo de migración desde el JSON on-premise hacia DynamoDB, sin implementar la lógica funcional.

## Entregable

Diseño de módulos backend y del flujo de migración documentado (en `docs/architecture/` y/o `docs/data/`) y estructura base prevista en `apps/api`, coherente con la arquitectura (US-002) y los contratos (US-003).

## Valor de negocio

Un diseño de módulos y del flujo de migración acordado evita improvisación en el backend, asegura que las reglas críticas vivan en el servidor y prepara la ejecución de la migración como primer entregable funcional.

## Criterios de aceptación

1. Existe un diseño de la estructura de módulos del backend que cubre los dominios del MVP (migración, activación/registro, autenticación, membresías/pagos, reservas, notificaciones, administración, analytics).
2. Cada módulo mapea a los contratos de API definidos en US-003.
3. Se define dónde y cómo se aplican validación de entrada, autorización por rol y logging estructurado (reglas críticas en backend).
4. Existe el diseño del flujo de migración: lectura del JSON on-premise desde S3, transformación y carga hacia DynamoDB, preservando socios, membresías, saldo pendiente resumido, estado legado e identificador legado.
5. El flujo de migración define manejo de errores, idempotencia y verificación de resultados.
6. No se almacenan contraseñas, datos de tarjeta, CVV ni secretos de Culqi.
7. Es coherente con la arquitectura (US-002) y el modelo de datos/contratos (US-003).
8. No incluye implementación funcional.

## Casos alternativos / excepciones

- Registros del JSON inconsistentes o incompletos: el diseño debe contemplar su manejo (rechazo, cuarentena o reporte) sin detener toda la migración.

## Trazabilidad

- Épica: EP-01
- Depende de: US-002, US-003
- Habilita: implementación de la migración y módulos backend en Sprint 1; entrada para US-010.
