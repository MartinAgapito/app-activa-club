# US-058 — Calcular las métricas de reservas y ocupación (servidor)

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-058                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Backend                                          |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Estado              | Ready                                            |
| Prioridad           | Media                                            |
| Estimación relativa | 5                                                |
| Dependencias        | US-054                                           |

## Historia

Como **administrador**, quiero **saber cuántas reservas tiene cada instalación, en qué días y horarios se concentran y qué porcentaje de su capacidad horaria se usa**, para **decidir horarios, mantenimientos y prioridades de inversión con datos y no con intuición**.

## Contrato de API

`GET /dashboard/admin` (admin, sin parámetros), campos `periods.last30Days`, `reservationsByResource`, `reservationsByDay`, `reservationsByHour` y `occupancy` (con `occupancyRate`, `reservedHours` y `operatingHours`), según la adenda del 2026-10-12 de `docs/api/contratos-api.md` §9 y §12. Patrones de acceso #21 (GSI3 por recurso y rango) y #30 (bloqueos que alcanzan la ventana) del modelo de datos; decisión en [ADR-0014](../../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md).

Resuelve las preguntas abiertas 1 (período de reservas: últimos 30 días con hoy), 2 (fórmula de ocupación) y 5 (desglose por hora) de EP-07 en lo que toca a esta historia. `periods.currentMonth` lo calcula esta historia o US-057, la que llegue primero al handler compartido; los campos de US-057 no cambian.

## Reglas de negocio

RN-ANL-03 (reservas por instalación), RN-ANL-04 (reservas por día y horario), RN-ANL-07 (ocupación de instalaciones).

## Valor de negocio

Es la analítica que justifica la digitalización ante la directiva del club: qué se usa, cuándo y cuánto. Y es la que permite decidir, por ejemplo, cuándo programar un mantenimiento para afectar al menor número de socios.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- Existen reservas (EP-04).
- US-054 provisionó la Lambda con `GetItem` y `Query` sobre la tabla base, GSI2 y GSI3 (contratos §12.2).

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. `periods.last30Days` es `[hoy − 29 días 00:00, mañana 00:00)` en `America/Lima`, expresado en UTC, con `timeZone = "America/Lima"`. Se cuentan las reservas **activas** (`CONFIRMED`, `PENDING_APPROVAL`, `APPROVED`) cuyo `startsAt` cae en esa ventana; las `CANCELLED` y `REJECTED` no cuentan.
2. `reservationsByResource` devuelve, para cada uno de los diez recursos del catálogo, la cantidad de reservas del período, incluidos los recursos con cero.
3. `reservationsByDay` devuelve 30 entradas ascendentes (`date` = `YYYY-MM-DD` de Lima), incluidos los días con cero.
4. `reservationsByHour` devuelve una entrada por hora de inicio (`hour` = `HH:00` de Lima), ascendente, desde la hora del `opensAt` más temprano hasta la hora previa al `closesAt` más tardío del catálogo (con el catálogo actual, `06:00` a `21:00`, 16 entradas), incluidas las horas con cero. Una reserva de 07:30 cuenta en `07:00`.
5. `Σ reservationsByResource = Σ reservationsByDay = Σ reservationsByHour`.
6. `occupancy` devuelve una entrada por recurso con `operatingHours` (horas del horario vigente en los 30 días menos las cubiertas por bloqueos de mantenimiento), `reservedHours` (duración de las reservas contadas menos la parte solapada con bloqueos) y `occupancyRate = reservedHours / operatingHours` acotado a `[0, 1]` y redondeado a 4 decimales; las horas, con hasta 2 decimales.
7. Un bloqueo de mantenimiento que empezó antes de la ventana y la alcanza se descuenta igual (patrón #30).
8. Todos los días y horas se calculan en `America/Lima`.
9. Las cifras se calculan con consultas por recurso (GSI3 y bloqueos de la tabla base) y el catálogo con `GetItem` por `resourceId`, nunca con un `Scan` (tampoco reutilizando el de `GET /resources`).
10. Los campos que entrega US-057 no cambian.
11. La respuesta no incluye datos personales: solo cantidades, horas y proporciones.

## Casos alternativos / excepciones

- **Recurso con bloqueos de mantenimiento que cubren todo el período**: `operatingHours = 0` y `occupancyRate = 0`, no error ni división por cero.
- **Recurso con `resourceStatus = MAINTENANCE` (bloqueo indefinido)**: no se descuenta, porque no hay registro de desde cuándo rige; limitación aceptada para el MVP (contratos §9).
- **Cambio de horario de un recurso dentro del período**: se usa el horario vigente al momento del cálculo; simplificación aceptable para el MVP.
- **Reserva activa dentro de un bloqueo de mantenimiento**: cuenta en los conteos, pero su parte solapada no suma a `reservedHours`.
- **Reservas con invitados**: cuentan como una reserva; el aforo usado no entra en esta métrica.

## Sugerencia de pruebas funcionales

- DA-05: reservas preparadas en tres recursos → conteos exactos y ceros en el resto.
- DA-06: reservas en días distintos → serie diaria con ceros intermedios.
- DA-09 (ajustado al período de 30 días): `futbol-1` (06:00–22:00) sin mantenimiento y con solo dos reservas de 90 minutos en el período → `reservedHours=3`, `operatingHours=480`, `occupancyRate=0.0063`. La función pura de ocupación se prueba además con entradas simples: 2 horas reservadas sobre 10 operativas → `0.2`.
- Reservas a las 07:30 y 07:00 → ambas en `07:00`; borde de medianoche de Lima en `reservationsByDay`.
- Bloqueo que empieza el día anterior a la ventana → descontado.
- Reservas canceladas → no cuentan.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-ANL-03, RN-ANL-04, RN-ANL-07.
- Contrato: `docs/api/contratos-api.md` §9 y §12; modelo de datos patrones #21 y #30; ADR-0014.
- Casos de prueba: DA-05, DA-06, DA-09; se propone a QA un caso para `reservationsByHour`.
- Depende de: US-054.
- Habilita: US-060.

## Historial de cambios

- 2026-10-12: Contrato definido por el Arquitecto: `periods`, `reservationsByHour`, detalle de `occupancy` y fórmula. Estado: Ready.
