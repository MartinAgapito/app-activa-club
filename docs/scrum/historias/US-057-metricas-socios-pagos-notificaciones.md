# US-057 — Calcular las métricas de socios, membresías, pagos y notificaciones (servidor)

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-057                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Backend                                          |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Alta                                             |
| Estimación relativa | 5                                                |
| Dependencias        | US-038, US-054                                   |

## Historia

Como **administrador**, quiero **conocer cuántos socios hay en cada estado, cuántas membresías están por vencer, cuántas reservas esperan mi aprobación, cuántos pagos salieron bien o mal y cuántos avisos se enviaron**, para **saber de un vistazo qué requiere mi atención y cómo va la operación del club**.

## Contrato de API

`GET /dashboard/admin` (admin), según `docs/api/contratos-api.md` §9; tipo `AdminDashboard` en `packages/shared-types/src/dashboard.ts`. Esta historia entrega los campos `membersByStatus`, `membershipsExpiringSoon`, `pendingApprovals`, `payments` y `notificationsSent`. Los campos de reservas y ocupación (`reservationsByResource`, `reservationsByDay`, `occupancy`) los entrega US-058 sobre el mismo endpoint; hasta entonces van vacíos, no ausentes.

## Reglas de negocio

RN-ANL-01 (socios por estado), RN-ANL-02 (membresías próximas a vencer), RN-ANL-05 (reservas pendientes de aprobación), RN-ANL-06 (pagos exitosos y fallidos), RN-ANL-08 (notificaciones enviadas), RN-ADM-08. Modelo de datos: GSI2, patrones 14, 15, 16, 17 y 18.

## Valor de negocio

Son los indicadores de atención inmediata del administrador: solicitudes que esperan, reservas que esperan, cobros que fallaron, socios que están por irse. Hoy cada uno requiere entrar a una pantalla distinta, y algunos ni siquiera se pueden ver.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- US-038 en producción: sin ella, `membershipsExpiringSoon` sale en cero aunque haya socios por vencer.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. `membersByStatus` devuelve la cantidad de socios en cada `memberStatus` (`MIGRATED`, `PENDING`, `APPROVED`, `REJECTED`, `ACTIVE`), incluidos los estados con cero.
2. `membershipsExpiringSoon` devuelve la cantidad de socios con `membershipStatus=EXPIRING_SOON` (mismo umbral de 7 días que US-038).
3. `pendingApprovals` devuelve la cantidad de reservas en `PENDING_APPROVAL` cuyo inicio todavía no pasó.
4. `payments` devuelve la cantidad de pagos `SUCCEEDED` y `FAILED` del período de la métrica (ver pregunta abierta 1 de EP-07; propuesta: mes calendario en curso, hora de Lima). Los `PENDING_CONFIRMATION` no se cuentan como ninguno de los dos.
5. `notificationsSent` devuelve la cantidad de notificaciones registradas en el mismo período, según el criterio de qué se cuenta que se resuelva en la pregunta abierta 6 de EP-07.
6. Las cifras coinciden con lo que muestran las pantallas de detalle: los socios de US-051 por estado, las reservas pendientes de US-034, los pagos de US-053 y el historial de US-049.
7. Ninguna métrica se calcula con un `Scan` completo de la tabla: cada una usa el patrón de acceso del modelo indicado arriba.
8. La respuesta no incluye datos personales: solo cantidades.
9. Token `member` → 403.

## Casos alternativos / excepciones

- **Tabla sin datos de un tipo** (por ejemplo, ningún pago en el mes): la métrica va en cero, sin error.
- **Montos recaudados**: no están en el contrato ni en RN-ANL; fuera de esta historia.

## Sugerencia de pruebas funcionales

- DA-03: socios preparados en cada estado → conteos exactos, incluidos ceros.
- DA-04: socios por vencer → conteo coincide con el filtro "Por vencer" de US-052.
- DA-07: dos parrillas pendientes futuras y una pasada → `pendingApprovals=2`.
- DA-08: pagos exitosos, fallidos y en verificación del mes → solo cuentan los dos primeros.
- N-12: avisos publicados → `notificationsSent` coherente.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-ANL-01, RN-ANL-02, RN-ANL-05, RN-ANL-06, RN-ANL-08, RN-ADM-08.
- Casos de prueba: DA-03, DA-04, DA-07, DA-08, N-12.
- Depende de: US-038, US-054.
- Habilita: US-059.
