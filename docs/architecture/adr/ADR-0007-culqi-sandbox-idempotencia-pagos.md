# ADR-0007 — Culqi sandbox e idempotencia de pagos

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002, US-003

## Contexto

Todos los pagos son digitales con tarjeta vía **Culqi sandbox** (RN-PAG-04). No
se pueden almacenar datos de tarjeta, CVV ni secretos de Culqi (RN-PAG-08). El
estado de membresía solo se actualiza cuando el resultado del pago se confirma de
forma segura (RN-PAG-07). Un socio con deuda puede pagar pero no reservar
(RN-PAG-06).

## Decisión

Integración con Culqi con separación estricta cliente/servidor e idempotencia.

- **Tokenización en el cliente**: el frontend usa Culqi.js con la **llave
  pública** para tokenizar la tarjeta. Los datos de tarjeta/CVV **nunca** llegan
  al backend ni a DynamoDB.
- **Cargo server-side**: `POST /payments` recibe el `culqiToken` + un
  `idempotencyKey` generado por el cliente. La Lambda crea el cargo usando la
  **llave privada** (secreto en SSM/Secrets Manager, nunca en el repo).
- **Idempotencia**: antes de cobrar, se escribe un item de idempotencia en
  DynamoDB con condición `attribute_not_exists` sobre `idempotencyKey`. Si la
  clave ya existe, se devuelve el resultado previo sin volver a cobrar. Evita
  cargos duplicados por reintentos/doble clic. TTL sobre estos ítems.
- **Confirmación segura del estado**: la membresía se activa/renueva solo con un
  resultado de cargo verificado. Se soporta además un **webhook de Culqi**
  (`POST /payments/webhook`, firma verificada) para confirmación asíncrona; el
  estado converge de forma idempotente.
- **Persistencia mínima**: se guardan `paymentId`, `culqiChargeId`, monto,
  moneda, estado (`PENDING_CONFIRMATION`/`SUCCEEDED`/`FAILED`), tipo de membresía
  y marca de tiempo. Nunca PAN/CVV ni secretos.

## Alternativas consideradas

- **Cobro desde el frontend con confirmación por UI**: inseguro; permitiría
  falsear el resultado. Rechazada; la confirmación debe ser server-side.
- **Sin idempotencia (confiar en un solo intento)**: riesgo de cargos duplicados
  por reintentos de red o del usuario. Rechazada.
- **Solo respuesta síncrona (sin webhook)**: funciona para la demo, pero el
  webhook aporta robustez ante respuestas perdidas. Se implementa el webhook como
  refuerzo idempotente.

## Consecuencias

- **Positivas**: cumplimiento de PCI por diseño (sin datos de tarjeta en el
  backend), sin cargos duplicados, estado de membresía confiable.
- **Negativas**: el flujo tiene dos rutas de confirmación (síncrona y webhook)
  que deben converger idempotentemente; hay que gestionar el secreto de la llave
  privada.
- **Impacto**:
  - _Backend (US-009)_: Lambda de pago con idempotencia + Lambda de webhook con
    verificación de firma; actualización de membresía solo tras confirmación.
  - _Frontend (US-008)_: Culqi.js con llave pública; envía token + idempotencyKey.
  - _Terraform (US-004)_: secreto de llave privada en SSM/Secrets Manager; ruta de
    webhook pública sin authorizer pero con verificación de firma.
  - _Security_: RN-PAG-08 verificable; ningún secreto en repo.
  - _QA_: pruebas de doble envío (misma idempotencyKey), pago fallido y bloqueo de
    reserva con deuda.
