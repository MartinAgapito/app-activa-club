# US-058 — Calcular las métricas de reservas y ocupación (servidor)

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-058                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Backend                                          |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Media                                            |
| Estimación relativa | 5                                                |
| Dependencias        | US-054                                           |

## Historia

Como **administrador**, quiero **saber cuántas reservas tiene cada instalación, en qué días y horarios se concentran y qué porcentaje de su capacidad horaria se usa**, para **decidir horarios, mantenimientos y prioridades de inversión con datos y no con intuición**.

## Contrato de API

`GET /dashboard/admin` (admin), campos `reservationsByResource`, `reservationsByDay` y `occupancy` (`docs/api/contratos-api.md` §9). El desglose por **horario** no está en el contrato actual: ver criterio 3 y pregunta abierta 5 de EP-07.

## Reglas de negocio

RN-ANL-03 (reservas por instalación), RN-ANL-04 (reservas por día y horario), RN-ANL-07 (ocupación de instalaciones). Modelo de datos: patrón 21 (GSI3 por recurso y rango de tiempo).

## Valor de negocio

Es la analítica que justifica la digitalización ante la directiva del club: qué se usa, cuándo y cuánto. Y es la que permite decidir, por ejemplo, cuándo programar un mantenimiento para afectar al menor número de socios.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- Existen reservas (EP-04).

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Se consideran las reservas **activas** (`CONFIRMED`, `PENDING_APPROVAL`, `APPROVED`) del período de la métrica (ver pregunta abierta 1 de EP-07; propuesta: los últimos 30 días hasta hoy, hora de Lima). Las `CANCELLED` y `REJECTED` no cuentan, igual que en la disponibilidad.
2. `reservationsByResource` devuelve, para cada uno de los diez recursos del catálogo, la cantidad de reservas del período, incluidos los recursos con cero.
3. `reservationsByDay` devuelve una entrada por día del período con la cantidad de reservas, incluidos los días con cero. El desglose por franja horaria requiere la extensión de contrato que el Arquitecto documente (propuesta: cantidad por hora de inicio, 06:00 a 21:00); sin esa extensión la historia no está lista en ese punto.
4. `occupancy` devuelve, por recurso, la proporción entre las horas reservadas y las horas operativas del período según el horario vigente del recurso, excluyendo las horas bloqueadas por mantenimiento (propuesta de fórmula; ver pregunta abierta 2 de EP-07). El valor está entre 0 y 1.
5. Todos los días y horas se calculan en `America/Lima`.
6. Las cifras se calculan con consultas por recurso y rango de tiempo (GSI3), nunca con un `Scan` completo de la tabla.
7. Los campos que entrega US-057 no cambian.
8. La respuesta no incluye datos personales: solo cantidades y proporciones.

## Casos alternativos / excepciones

- **Recurso en mantenimiento todo el período**: horas operativas cero; la ocupación se informa como `0`, no como error ni división por cero.
- **Cambio de horario de un recurso dentro del período**: se usa el horario vigente al momento del cálculo; es una simplificación aceptable para el MVP.
- **Reservas con invitados**: cuentan como una reserva; el aforo usado no entra en esta métrica.

## Sugerencia de pruebas funcionales

- DA-05: reservas preparadas en tres recursos → conteos exactos y ceros en el resto.
- DA-06: reservas en días distintos → serie diaria con ceros intermedios.
- DA-09: una cancha con 2 de 10 franjas reservadas en un día y sin mantenimiento → `occupancyRate=0.2` para ese día.
- Reservas canceladas → no cuentan.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-ANL-03, RN-ANL-04, RN-ANL-07.
- Casos de prueba: DA-05, DA-06, DA-09.
- Depende de: US-054.
- Habilita: US-060.
