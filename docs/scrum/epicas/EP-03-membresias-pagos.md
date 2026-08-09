# EP-03 — Membresías y pagos

| Campo            | Valor        |
| ---------------- | ------------ |
| ID               | EP-03        |
| Tipo             | Épica        |
| Fase             | MVP          |
| Estado           | Planificada  |
| Dependencias     | EP-01, EP-02 |
| Sprint principal | Sprint 2     |

## Descripción

Entregar el segundo bloque funcional de negocio de Activa Club: convertir una cuenta digital ya existente (creada por activación o por registro + aprobación en EP-02) en un **socio activo al día**, mediante el pago digital de su membresía mensual o anual con tarjeta a través de **Culqi sandbox**.

La épica cubre la consulta de planes disponibles, el pago de la primera membresía tras la aprobación administrativa, el pago de renovación (incluida la deuda de un socio migrado con membresía vencida), la autorización explícita de renovación automática, la confirmación asíncrona del pago mediante el webhook de Culqi y el historial de pagos para socio y administrador. Todo el flujo respeta la separación cliente/servidor y la idempotencia definidas en [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).

## Valor de negocio

Al cerrar el Sprint 1 quedó un vacío conocido y documentado: un socio nuevo aprobado (`memberStatus=APPROVED`) **no puede operar** porque RN-ACT-07 exige el pago de la primera membresía para quedar `ACTIVE`; el frontend lo redirige a una pantalla de "pendiente de pago" que hoy no tiene salida. Lo mismo ocurre con un socio migrado cuya membresía llegó vencida o con deuda (RN-PAG-06). EP-03 es la pieza que **desbloquea la operación real del socio**: sin ella nadie puede quedar activo y, por lo tanto, EP-04 (reservas) no tiene usuarios habilitados sobre los que operar.

Además, EP-03 es el módulo donde el proyecto demuestra manejo responsable de medios de pago: la plataforma cobra con tarjeta sin que ningún dato de tarjeta toque el backend ni la base de datos (RN-PAG-08), y sin generar cargos duplicados ante reintentos (RT-01).

## Objetivos de la épica

- Infraestructura de endpoints serverless de membresías y pagos provisionada en Terraform, con la llave privada de Culqi resguardada como secreto (nunca en el repositorio).
- Consulta de los planes de membresía disponibles (mensual y anual, con facilidades de pago de la anual cuando la integración lo permita).
- Pago de la **primera membresía** con tarjeta vía Culqi sandbox, que transiciona al socio a `ACTIVE` con `membershipEndsAt` correcto (cierra RN-ACT-07).
- Pago de **renovación / regularización de deuda** para socios `ACTIVE`, `EXPIRING_SOON`, `EXPIRED` o `DEBT` (RN-PAG-06).
- **Renovación automática opcional** habilitada solo con autorización explícita del socio, reversible en cualquier momento (RN-PAG-03).
- **Idempotencia** del cobro: la misma `idempotencyKey` nunca genera dos cargos (ADR-0007, RT-01).
- **Confirmación segura** del estado de membresía: síncrona por respuesta del cargo y asíncrona por webhook de Culqi con firma verificada, convergiendo de forma idempotente (RN-PAG-07).
- **Historial de pagos**: propio para el socio, filtrado para el administrador.
- **Manejo seguro de datos de pago** verificado extremo a extremo: ni PAN, ni CVV, ni secretos de Culqi en requests, respuestas, logs o DynamoDB (RN-PAG-08).

## Historias asociadas

| ID                                                                      | Título                                                          | Responsable        | Depende de     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------ | -------------- |
| [US-019](../historias/US-019-provisionar-endpoints-membresias-pagos.md) | Provisionar endpoints e infraestructura de membresías y pagos   | DevOps             | —              |
| [US-020](../historias/US-020-consultar-planes-membresia.md)             | Consultar los planes de membresía disponibles                   | Backend + Frontend | US-019         |
| [US-021](../historias/US-021-cobro-membresia-idempotente-culqi.md)      | Cobrar la membresía con Culqi de forma idempotente y confirmada | Backend            | US-019         |
| [US-022](../historias/US-022-checkout-pago-membresia.md)                | Pagar la membresía desde la plataforma (checkout)               | Frontend           | US-020, US-021 |
| [US-023](../historias/US-023-renovacion-membresia-autorenovacion.md)    | Renovar la membresía y autorizar la renovación automática       | Backend + Frontend | US-021, US-022 |
| [US-024](../historias/US-024-webhook-confirmacion-culqi.md)             | Confirmar pagos mediante el webhook de Culqi                    | Backend            | US-019, US-021 |
| [US-025](../historias/US-025-historial-pagos.md)                        | Consultar el historial de pagos (socio y administrador)         | Backend + Frontend | US-021         |
| [US-026](../historias/US-026-manejo-seguro-datos-pago.md)               | Garantizar el manejo seguro de los datos de pago                | Backend + DevOps   | US-021, US-024 |

## Criterios de aceptación de la épica

- Todas las historias asociadas cumplen su Definition of Done.
- Un socio aprobado (`APPROVED`) puede pagar su primera membresía y queda `ACTIVE` con `membershipEndsAt` coherente con el plan elegido (RN-ACT-07, RN-PAG-01/07).
- Un socio con membresía vencida o con deuda puede iniciar sesión y pagar para regularizarse (RN-PAG-06).
- Ningún pago se cobra dos veces: la misma `idempotencyKey` devuelve el resultado previo sin generar un cargo nuevo (ADR-0007).
- El estado de membresía solo cambia con un resultado de pago confirmado de forma segura, ya sea por la respuesta del cargo o por el webhook con firma verificada (RN-PAG-07).
- La renovación automática se activa únicamente con autorización explícita del socio y puede revocarse (RN-PAG-03).
- El socio ve su historial de pagos propio y el administrador puede consultar pagos filtrados (RN-ADM).
- No existe PAN, CVV ni secreto de Culqi en ningún request, respuesta, log de CloudWatch, ítem de DynamoDB ni archivo del repositorio (RN-PAG-08).
- Los casos P-01..P-12 de `docs/testing/matriz-trazabilidad.md` §3 quedan cubiertos, salvo los que dependen explícitamente de EP-04/EP-05 (ver siguiente sección).
- No se introduce alcance fuera de lo clasificado como MVP en la matriz de alcance, sección 3.

## Alcance explícitamente fuera de EP-03

Clasificado como **fuera de alcance** en la matriz de alcance §3 (no se implementa):

- Pagos en efectivo, Yape, Plin o transferencias.
- Pagos manuales registrados por un administrador.
- Facturación electrónica o integración tributaria.
- Migración de pagos históricos detallados (matriz §1).

Pertenece al MVP pero se entrega en otras épicas (no en EP-03):

- **Bloqueo efectivo de la reserva** para socio con deuda o membresía vencida (`POST /reservations` → `MEMBER_HAS_DEBT`): EP-04. EP-03 entrega el estado correcto (`membershipStatus`) sobre el que EP-04 decide; el caso P-10 de la matriz de trazabilidad se cierra en EP-04.
- **Notificaciones** `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` como módulo (envío por correo y bandeja interna): EP-05. En EP-03 los eventos se disparan según el contrato, sin construir el módulo de notificaciones (caso P-11).
- **Métricas de pagos** en el dashboard administrativo (pagos exitosos/fallidos, ingresos): EP-07.

## Decisión funcional pendiente (a resolver en el Sprint Planning)

La matriz de alcance §3 clasifica como MVP la "renovación automática opcional con autorización explícita (opt-in del socio)". Los contratos vigentes cubren la **autorización** (`PATCH /members/me/auto-renew`, `autoRenew` en `POST /payments`) pero **no** la ejecución de un cargo recurrente desatendido (tarjeta en archivo + planificador), que no está contemplada en ADR-0007. EP-03 entrega la autorización explícita, su revocación y su visibilidad; la ejecución automática del cargo requiere una decisión previa del Arquitecto (ADR complementario) sobre soporte de cargos recurrentes en Culqi sandbox. Ver US-023 y los riesgos del Sprint 2.

## Historial de cambios

- 2026-08-09: Creación de la épica EP-03 y asociación de las historias del Sprint 2 (US-019..US-026).
