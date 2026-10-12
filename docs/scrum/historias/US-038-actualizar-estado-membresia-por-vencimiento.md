# US-038 — Actualizar el estado de la membresía según su vencimiento

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-038                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Deuda técnica de EP-03 (tarea técnica)       |
| Responsable         | Backend + DevOps                             |
| Fase                | MVP                                          |
| Sprint              | Sprint 4 (arrastre de EP-03)                 |
| Prioridad           | Crítica                                      |
| Estimación relativa | 3                                            |
| Dependencias        | US-021 (implementada)                        |

## Contexto

Hoy `membershipStatus` solo se calcula en tres momentos: la migración (`apps/api/src/migration/transform.ts`), la activación de la cuenta y la confirmación de un pago. **Nada lo recalcula cuando pasa el tiempo.** Un socio que pagó un mes y no renueva sigue figurando `membershipStatus=ACTIVE` indefinidamente después de su `membershipEndsAt`, y por lo tanto:

- puede seguir reservando, lo que viola RN-PAG-06 y RN-RES-12 (el chequeo de `POST /reservations` mira `membershipStatus`, no la fecha);
- nunca aparece como `EXPIRING_SOON`, así que no existe a quién avisar de una renovación próxima (RN-NOT-04) ni a quién incluir en los segmentos `EXPIRING_SOON`/`EXPIRED` (RN-NOT-03);
- las métricas de membresías próximas a vencer (RN-ANL-02) y de socios por estado salen falsas.

Es deuda de EP-03, no una capacidad nueva: se planifica al inicio del Sprint 4 porque EP-05 y EP-07 se apoyan en un `membershipStatus` confiable. Mismo criterio que US-037 en el Sprint 3.

## Objetivo

Que el estado de membresía de cada socio refleje su fecha de vencimiento real sin intervención manual: pasa a **por vencer** cuando faltan 7 días o menos y a **vencida** cuando la fecha ya pasó.

## Entregable

- Un proceso programado diario, definido en Terraform, que recalcula `membershipStatus` de los socios cuya vigencia cruzó un umbral.
- Una regla de vigencia única y compartida (la misma que hoy usan la migración y la activación) para no tener dos definiciones de "por vencer".
- Defensa en profundidad en la validación de reservas: la fecha de vencimiento se evalúa también en el momento de reservar.

## Reglas de negocio

RN-PAG-06 (deuda o membresía vencida no reserva), RN-RES-12 (solo activos sin deuda reservan), RN-ANL-02 (membresías próximas a vencer). Modelo de datos: patrón de acceso 15 (`GSI2PK=MEMBERSHIP#ACTIVE`, rango `endsAt`) o el que el Arquitecto confirme.

## Valor de negocio

Cierra un hueco que hoy deja reservar a socios con la membresía vencida, que es exactamente lo que el club quiere evitar al digitalizar los cobros. También es la base de los avisos de renovación (US-047), de los segmentos de notificación (US-048) y de los dashboards (US-055, US-057).

## Precondiciones

- Existen socios con `membershipEndsAt` poblado (migrados o que pagaron, EP-02/EP-03).

## Postcondiciones

- Todo socio con membresía vencida figura `membershipStatus=EXPIRED`; todo socio con vencimiento dentro de los próximos 7 días figura `EXPIRING_SOON`.
- Queda el rastro de cada transición para que US-047 emita los avisos de renovación.

## Criterios de aceptación

1. El proceso se ejecuta automáticamente una vez al día, a una hora fija de `America/Lima` (propuesta: 00:15), sin intervención manual. Su programación vive en Terraform.
2. Un socio con `membershipStatus` `ACTIVE` o `EXPIRING_SOON` cuyo `membershipEndsAt` ya pasó (fecha de Lima) queda `EXPIRED`.
3. Un socio con `membershipStatus=ACTIVE` cuyo `membershipEndsAt` cae dentro de los próximos 7 días (inclusive) queda `EXPIRING_SOON`. El umbral de 7 días es el mismo que ya usa la migración y se define en un único lugar.
4. Los socios `DEBT` y `NONE` no se modifican: la deuda tiene prioridad sobre la vigencia y un socio sin membresía no vence. Un socio ya `EXPIRED` no se vuelve a tocar.
5. El proceso no cambia `memberStatus` (el socio sigue `ACTIVE` y puede iniciar sesión y pagar, RN-PAG-06) ni `outstandingBalance` (vencer no genera deuda; ver pregunta abierta 2 de EP-05).
6. Ejecutarlo dos veces el mismo día deja el mismo resultado (idempotente).
7. Si un socio renueva mientras el proceso corre, el proceso no revierte la renovación: la escritura es condicional sobre la vigencia leída.
8. `POST /reservations` rechaza con `MEMBER_HAS_DEBT` a un titular cuyo `membershipEndsAt` ya pasó **aunque el proceso todavía no haya corrido** (por ejemplo, entre la medianoche y la ejecución, o si una ejecución falló).
9. Un error con un socio no detiene el proceso para el resto; queda registrado en el log.
10. Cada ejecución deja un log estructurado con: socios evaluados, transiciones a `EXPIRING_SOON`, transiciones a `EXPIRED` y errores. Una ejecución fallida dispara una alarma (ADR-0008).
11. Cada transición deja el rastro necesario para que US-047 emita `RENEWAL_DUE` o `RENEWAL_OVERDUE`. Esta historia **no** envía notificaciones.
12. No hay recursos siempre encendidos; el costo se mantiene dentro de la capa gratuita.

## Casos alternativos / excepciones

- **Socio migrado sin activar** (`memberStatus=MIGRATED`): también se le recalcula la vigencia, para que al activarse vea su estado real y para que las métricas sean correctas.
- **Socio que paga el mismo día en que vence**: la renovación encadenada de US-021 ya lo deja `ACTIVE` con la nueva vigencia; el proceso no lo pisa (criterio 7).
- **Proceso caído varios días**: la siguiente ejecución pone al día a todos los socios, porque compara contra la fecha, no contra "ayer".
- **Renovación automática activada** (`autoRenew=true`): el proceso igual marca `EXPIRED`. El cobro desatendido sigue sin existir (ver EP-03, decisión pendiente) y esta historia no lo implementa.

## Sugerencia de pruebas funcionales

- Unitarias de la regla de vigencia con bordes: vence hoy, vence en 7 días, vence en 8 días, venció ayer.
- Socio `ACTIVE` con vencimiento ayer → `EXPIRED` tras la ejecución; intenta reservar → 422 `MEMBER_HAS_DEBT`.
- Socio `ACTIVE` con vencimiento ayer, **sin** ejecutar el proceso → `POST /reservations` igual responde `MEMBER_HAS_DEBT` (criterio 8).
- Socio `DEBT` con vencimiento pasado → sigue `DEBT`.
- Doble ejecución el mismo día → mismos estados, mismo número de transiciones registradas la primera vez y cero la segunda.

## Trazabilidad

- Épica: EP-03 (deuda técnica).
- Reglas: RN-PAG-06, RN-RES-12, RN-ANL-02.
- Casos de prueba: P-10 (refuerzo), DA-02 y DA-04 (habilitados); se propone a QA un caso nuevo de vencimiento automático.
- Depende de: US-021 (vigencia calculada al pagar).
- Habilita: US-047, US-048, US-052, US-055, US-057.

## Historial de cambios

- 2026-10-12: Implementada, pendiente verificación en `dev`. Regla de vigencia única en `apps/api/src/memberships/vigency.ts`; proceso diario `memberships-expire` (EventBridge `cron(15 5 * * ? *)` = 00:15 Lima, módulo `scheduled-job`); defensa por fecha en `POST /reservations`. Rastro para US-047: ítem `MembershipTransition` (modelo-dynamodb.md §3.17, patrón #27), escrito en la misma transacción que el cambio de estado.
- 2026-10-12: US-047 consume el rastro: patrón #27 lo lee el proceso `memberships-notify` (08:00 Lima), que retira `GSI2PK/GSI2SK` al avisar. Sin cambios en US-038.
