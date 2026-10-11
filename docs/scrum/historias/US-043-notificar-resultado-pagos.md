# US-043 — Notificar el resultado de un pago

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-043                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 3                                          |
| Dependencias        | US-040                                     |

## Historia

Como **socio**, quiero **recibir un aviso cuando mi pago se confirma o es rechazado**, para **tener constancia del cobro y saber si mi membresía quedó activa o si tengo que intentarlo de nuevo**.

## Contrato de API

Sin endpoints nuevos. Efecto lateral de la confirmación de un pago por cualquiera de sus dos caminos: la respuesta síncrona de `POST /payments` y el webhook `POST /payments/webhook` (§5). Eventos `PAYMENT_SUCCEEDED` y `PAYMENT_FAILED`.

## Reglas de negocio

RN-NOT-04 (pago exitoso o fallido), RN-PAG-07 (el estado cambia solo cuando el resultado se confirma de forma segura), RN-PAG-08 (sin datos de tarjeta).

## Valor de negocio

Un pago que quedó "en verificación" se confirma a veces por el webhook, minutos después y con el socio ya fuera de la pantalla. El aviso es lo que cierra ese ciclo y le da al socio un comprobante propio del club.

## Precondiciones

- US-040 disponible. Pagos operativos contra Stripe test mode (US-037).

## Postcondiciones

- Cada pago que llega a un estado final (`SUCCEEDED` o `FAILED`) deja exactamente un aviso al socio que pagó.

## Criterios de aceptación

1. Un pago que pasa a `SUCCEEDED` emite `PAYMENT_SUCCEEDED` con el plan, el monto en soles y la nueva fecha de vencimiento de la membresía.
2. Un pago que pasa a `FAILED` emite `PAYMENT_FAILED` con el motivo legible del catálogo propio (el mismo que ya muestra el checkout) y una invitación a reintentar.
3. Un pago que queda en `PENDING_CONFIRMATION` no emite aviso; el aviso llega cuando el webhook lo resuelve.
4. Cuando la respuesta síncrona y el webhook confirman el mismo pago, se emite **un solo** aviso: lo emite únicamente el camino que efectivamente cambió el estado.
5. Un reintento con la misma `idempotencyKey` (`PAYMENT_DUPLICATE`) no emite un aviso nuevo.
6. Ningún texto incluye número de tarjeta, últimos dígitos, `stripePaymentIntentId`, `stripePaymentMethodId` ni ningún secreto (RN-PAG-08).
7. Un fallo de correo o de bandeja no cambia la respuesta de `POST /payments` ni la del webhook a Stripe (US-040, criterios 5 y 7); en particular, el webhook no debe responder error a Stripe por un fallo de notificación, para no provocar reintentos del proveedor.

## Casos alternativos / excepciones

- **Pago rechazado antes de llegar a Stripe** (validación, socio no habilitado, 403 `MEMBER_NOT_APPROVED`): no hay pago registrado, no hay aviso.
- **Webhook con firma inválida**: se rechaza como hoy y no emite nada.
- **Socio `APPROVED` que paga su primera membresía**: al confirmarse queda `ACTIVE` y verá el aviso en su bandeja.

## Sugerencia de pruebas funcionales

- P-11: pago exitoso → `PAYMENT_SUCCEEDED`; pago con tarjeta de rechazo → `PAYMENT_FAILED`.
- Convergencia: confirmación síncrona seguida del webhook del mismo pago → un solo aviso.
- Reenvío del mismo webhook firmado → sin aviso adicional.
- Revisión del texto: sin datos sensibles (P-08, T-04).

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-04, RN-PAG-07, RN-PAG-08.
- Casos de prueba: P-11.
- Depende de: US-040.
- Habilita: cierre de los eventos pendientes del Sprint 2.
