# US-055 — Obtener el resumen personal del socio (servidor)

| Campo               | Valor                                            |
| ------------------- | ------------------------------------------------ |
| ID                  | US-055                                           |
| Épica               | [EP-07](../epicas/EP-07-dashboards-analytics.md) |
| Tipo                | Historia de usuario                              |
| Responsable         | Backend                                          |
| Fase                | MVP                                              |
| Sprint              | Sprint 5                                         |
| Prioridad           | Alta                                             |
| Estimación relativa | 5                                                |
| Dependencias        | US-038, US-041, US-054                           |

## Historia

Como **socio**, quiero **que la plataforma me dé en una sola consulta mi situación de membresía, si puedo reservar, mis alertas, mis próximas reservas y mis avisos recientes**, para **entender de un vistazo cómo estoy con el club y qué tengo que hacer**.

## Contrato de API

`GET /dashboard/member` (member), según `docs/api/contratos-api.md` §9. Tipo ya versionado: `MemberDashboard` en `packages/shared-types/src/dashboard.ts`. La identidad sale del token; no hay `memberId` en la ruta.

## Reglas de negocio

RN-PAG-06 y RN-RES-12 (`canReserve`: activo y sin deuda), RN-RES-06 (las reservas del socio son aquellas de las que es titular), RN-NOT-01. Modelo de datos: patrones 11 (socio por `cognitoSub`), 12 (reservas del socio, GSI1) y 5 (bandeja).

## Valor de negocio

Es la portada del socio. Concentra en una sola respuesta lo que hoy está repartido en cuatro pantallas y, sobre todo, le explica **por qué** no puede reservar cuando no puede, con el camino para resolverlo.

## Precondiciones

- El socio tiene sesión iniciada con rol `member`.
- US-038 en producción (estado de membresía al día) y US-041 (bandeja) disponibles.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. La respuesta incluye el nombre de pila y el `memberStatus` del socio autenticado, y de ningún otro.
2. `membership` incluye tipo, estado, fecha de vencimiento, saldo pendiente y `daysRemaining`, calculado en días calendario de `America/Lima`; `daysRemaining` es `null` si no hay vigencia o si ya venció.
3. `canReserve` es `true` **solo** si el socio cumple exactamente la misma regla que aplica `POST /reservations` (incluida la verificación por fecha de US-038, criterio 8). Se usa la misma función, no una copia; no puede haber un socio con `canReserve=true` al que la reserva le responda `MEMBER_HAS_DEBT` o `MEMBERSHIP_REQUIRED`, ni al revés.
4. `alerts` incluye una alerta por cada situación que requiere acción: membresía por vencer, membresía vencida, deuda pendiente. Cada alerta tiene un código estable y un mensaje en español; los códigos los documenta el Arquitecto en el contrato (ver pregunta abierta 4 de EP-07). Sin situaciones que atender, la lista va vacía.
5. `upcomingReservations` incluye hasta las 5 próximas reservas del socio como **titular**, en estados `CONFIRMED`, `PENDING_APPROVAL` o `APPROVED`, con inicio posterior al momento de la consulta, de la más cercana a la más lejana.
6. `recentNotifications` incluye hasta las 5 notificaciones más recientes de su bandeja, con su estado de lectura.
7. Un socio sin reservas ni notificaciones recibe listas vacías, no un error.
8. La respuesta no incluye datos de otros socios (ni de los participantes de sus reservas), ni datos de pago sensibles.
9. Token `admin` → 403; sin token → 401.

## Casos alternativos / excepciones

- **Socio que todavía no es `ACTIVE`**: no llega al área de socio por el guard del frontend; si consulta el endpoint igual, recibe su resumen con `canReserve=false`.
- **Reservas en las que el socio es participante pero no titular**: no aparecen (misma decisión que US-033).
- **Resumen de pagos**: el contrato no lo incluye; el frontend lo obtiene del historial existente (US-056). Ver pregunta abierta 3 de EP-07.

## Sugerencia de pruebas funcionales

- DA-01 / P-10: socio activo al día → `canReserve=true`; con deuda → `false`; con membresía vencida (con y sin ejecución del proceso de US-038) → `false`. En los tres casos coincide con el resultado de `POST /reservations`.
- DA-02: socio por vencer → alerta de renovación con `daysRemaining` correcto en el borde de medianoche de Lima.
- Socio con 7 reservas futuras → recibe 5, ordenadas.
- Reservas canceladas o pasadas → no aparecen.

## Trazabilidad

- Épica: EP-07
- Reglas: RN-PAG-06, RN-RES-12, RN-RES-06, RN-NOT-01.
- Casos de prueba: DA-01, DA-02, P-10.
- Depende de: US-038, US-041, US-054.
- Habilita: US-056.

## Historial de cambios

- 2026-10-12: Implementada en backend: `GET /dashboard/member`, `canReserve` compartido con `POST /reservations` (`reservations/eligibility.ts`), próximas reservas por GSI1 (patrón #12) y bandeja (patrón #5). Códigos de alerta documentados en el contrato §9.
