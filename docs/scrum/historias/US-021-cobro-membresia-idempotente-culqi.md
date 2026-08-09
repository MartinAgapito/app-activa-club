# US-021 — Cobrar la membresía con Culqi de forma idempotente y confirmada

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-021                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Backend                                      |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Crítica                                      |
| Estimación relativa | 8                                            |
| Dependencias        | US-019                                       |

## Historia

Como **socio**, quiero **que el cobro de mi membresía se procese una sola vez y active mi membresía solo cuando el pago se confirme**, para **quedar activo sin riesgo de que me cobren dos veces ni de que mi cuenta cambie de estado por un pago que no prosperó**.

> Esta historia entrega el **comportamiento de servidor** del pago. La experiencia de pago del socio (formulario, tokenización con Culqi.js, resultado en pantalla) es US-022; ambas se desarrollan en paralelo contra el contrato ya definido.

## Contrato de API

`POST /payments` (member), según `docs/api/contratos-api.md` §5. Request: `membershipType`, `culqiToken`, `idempotencyKey`, `autoRenew` (opcional). Response 201 con `paymentId`, `paymentStatus`, `membershipType`, `amount`, `currency`, `membershipEndsAt`.

## Reglas de negocio

RN-PAG-01 (mensual/anual), RN-PAG-04 (pagos digitales vía Culqi sandbox), RN-PAG-06 (socio con deuda o vencido puede pagar), RN-PAG-07 (el estado de membresía solo cambia con confirmación segura), RN-PAG-08 (nunca datos de tarjeta ni secretos), RN-ACT-07 (el socio aprobado debe pagar para quedar activo). Decisión: [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).

## Valor de negocio

Es el corazón de EP-03 y la pieza que cierra el vacío dejado por el Sprint 1: hoy un socio aprobado queda atrapado en la pantalla de "pendiente de pago" sin forma de activarse. Además protege al club y al socio de dos riesgos concretos: el doble cargo por reintentos o doble clic (RT-01) y la activación de una membresía que en realidad no se pagó.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y su `memberStatus` es `APPROVED` (primer pago) o `ACTIVE` (renovación / regularización de deuda).
- El cliente ya obtuvo un `culqiToken` válido mediante Culqi.js (los datos de tarjeta nunca llegan al backend).
- La llave privada de Culqi está disponible como secreto (US-019).

## Postcondiciones

- Existe un ítem `Payment` del socio con su estado final (`SUCCEEDED`, `FAILED` o `PENDING_CONFIRMATION`) y su `idempotencyKey`.
- Si el pago se confirma: se crea el `MembershipPeriod` correspondiente, el socio queda `memberStatus=ACTIVE`, `membershipStatus=ACTIVE`, `membershipType` del plan pagado, `membershipEndsAt` recalculado y `outstandingBalance` en cero.
- Si el pago falla: no cambia ningún estado de membresía del socio.

## Reglas de cálculo de vigencia (funcionales)

- **Primer pago** (socio sin membresía vigente: `APPROVED`, `EXPIRED`, `DEBT` o `NONE`): la vigencia empieza en la fecha de confirmación del pago y termina en `+1 mes` (`MONTHLY`) o `+1 año` (`ANNUAL`).
- **Renovación anticipada** (socio con membresía vigente: `ACTIVE` o `EXPIRING_SOON`): la vigencia nueva se **encadena** al `membershipEndsAt` vigente, de modo que el socio no pierde días ya pagados.
- El monto cobrado es siempre el del plan resuelto por el backend (US-020); **no** se acepta un monto enviado por el cliente.

## Criterios de aceptación

1. `POST /payments` con un socio `APPROVED` o `ACTIVE`, un `culqiToken` válido y un `membershipType` soportado crea el cargo en Culqi sandbox **desde el servidor** usando la llave privada, y responde 201 con `paymentId`, `paymentStatus`, `membershipType`, `amount`, `currency` y `membershipEndsAt`.
2. Antes de intentar el cargo se registra la `idempotencyKey` en DynamoDB con condición `attribute_not_exists`; si la clave ya existe, **no se genera un cargo nuevo** y se devuelve el resultado previo con 409 `PAYMENT_DUPLICATE` (o el mismo resultado del pago original, según el contrato), en ambos casos sin efectos secundarios adicionales.
3. Un pago confirmado como exitoso actualiza en una sola operación atómica: `Payment` a `SUCCEEDED`, el `MembershipPeriod` nuevo, y el `Member` con `memberStatus=ACTIVE`, `membershipStatus=ACTIVE`, `membershipType`, `membershipStartedAt`, `membershipEndsAt` y `outstandingBalance=0`.
4. Un pago rechazado por Culqi responde 402/422 `PAYMENT_FAILED`, persiste el `Payment` con `paymentStatus=FAILED` y `failureReason` legible, y **no** modifica ningún campo de membresía del socio (RN-PAG-07).
5. Si Culqi responde de forma ambigua o se pierde la respuesta, el pago queda `PENDING_CONFIRMATION` y la membresía **no** se activa hasta que la confirmación llegue (por reconsulta o por webhook, US-024).
6. El monto y la moneda cobrados corresponden al plan solicitado según la configuración del backend; un `membershipType` no soportado devuelve 400 `VALIDATION_ERROR`.
7. Un socio en estado `PENDING` o `REJECTED` que intenta pagar recibe 403 `MEMBER_NOT_APPROVED` y no se genera ningún cargo.
8. Un socio con `membershipStatus` `DEBT` o `EXPIRED` **sí** puede pagar y su pago exitoso lo regulariza (RN-PAG-06).
9. La petición nunca acepta ni el backend nunca persiste PAN, CVV, fecha de vencimiento ni ningún dato de tarjeta; solo se guarda `culqiChargeId`, monto, moneda, estado, tipo de membresía, `idempotencyKey` y marcas de tiempo (RN-PAG-08).
10. La llave privada de Culqi se lee del secreto en tiempo de ejecución y nunca se escribe en logs ni en respuestas.
11. Si el request incluye `autoRenew=true`, se registra la solicitud en `autoRenewRequested` del pago y, al confirmarse, se refleja en el socio; el detalle de la autorización explícita se define en US-023.
12. El pago confirmado deja el rastro necesario para disparar el evento de notificación `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` previsto por el contrato, sin construir el módulo de notificaciones (EP-05).
13. Toda regla crítica (estado del socio, monto, idempotencia, transición de membresía) se valida en el backend, nunca solo en el frontend.

## Casos alternativos / excepciones

- **Doble clic del socio**: el frontend reenvía la misma `idempotencyKey`; el backend devuelve el resultado previo y el socio ve un único pago en su historial.
- **Reintento con `idempotencyKey` nueva tras un pago exitoso**: se trata como una renovación anticipada (la vigencia se encadena); no es un error.
- **Token de Culqi expirado o ya usado**: 402/422 `PAYMENT_FAILED` con motivo legible; el socio puede reintentar generando un token nuevo.
- **Falla de escritura en DynamoDB después de un cargo aprobado**: el pago queda `PENDING_CONFIRMATION` y el webhook (US-024) lo reconcilia de forma idempotente; nunca se cobra de nuevo.
- **Ítem de idempotencia vencido por TTL**: el TTL debe superar ampliamente la ventana de reintento razonable; un reintento posterior al TTL se considera un pago nuevo y así se documenta.

## Sugerencia de pruebas funcionales

- P-02: pago exitoso con tarjeta de prueba de Culqi sandbox → socio `ACTIVE` con `membershipEndsAt` correcto (mensual y anual).
- P-03: tarjeta de prueba de rechazo → `PAYMENT_FAILED`, membresía sin cambios.
- P-04: dos peticiones con la misma `idempotencyKey` → un solo cargo, resultado previo devuelto.
- P-09: socio con `DEBT`/`EXPIRED` inicia sesión y paga con éxito.
- P-08: inspección de request, respuesta, log y ítem de DynamoDB sin PAN/CVV/secretos.
- Socio `PENDING` intenta pagar → `MEMBER_NOT_APPROVED`.
- Renovación anticipada de un socio vigente → la vigencia se encadena, no se pierden días.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-01/04/06/07/08, RN-ACT-07. ADR-0007.
- Casos de prueba: P-02, P-03, P-04, P-08, P-09.
- Depende de: US-019 (endpoint y secreto).
- Habilita: US-022 (checkout), US-023 (renovación), US-024 (webhook), US-025 (historial).
