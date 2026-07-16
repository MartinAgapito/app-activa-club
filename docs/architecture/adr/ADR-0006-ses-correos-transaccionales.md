# ADR-0006 — SES para correos transaccionales

- **Estado**: Aceptado
- **Fecha**: 2026-07-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-002

## Contexto

El MVP requiere correos transaccionales para eventos relevantes (RN-NOT-02,
RN-NOT-04): activación, aprobación/rechazo, pago exitoso/fallido, renovación,
reservas y recordatorios. Las notificaciones internas (inbox) son obligatorias;
el correo las complementa.

## Decisión

Se usa **Amazon SES** para el envío de correos transaccionales.

- El envío se dispara desde las Lambdas de negocio tras un evento, de forma
  **best-effort**: la notificación interna en DynamoDB es la fuente obligatoria
  (RN-NOT-01); si el correo falla, se registra el error pero no se revierte la
  operación de negocio.
- **Plantillas** por tipo de evento (SES Templates) para consistencia.
- En sandbox de SES solo se envía a direcciones verificadas; suficiente para la
  demo. Los remitentes/identidades se verifican vía Terraform.
- El contenido no incluye datos sensibles (sin tarjetas, sin secretos).

## Alternativas consideradas

- **Proveedor externo (SendGrid/Mailgun)**: fuera del stack acordado y añade
  gestión de credenciales de terceros. Rechazada.
- **Envío síncrono bloqueante**: acoplaría el resultado del correo al éxito de la
  operación de negocio. Rechazada; el correo es complementario a la notificación
  interna.
- **Cola intermedia (SQS) + worker de correo**: robusto, pero sobrearquitectura
  para el volumen del MVP. Se deja como evolución futura si crece el volumen.

## Consecuencias

- **Positivas**: bajo costo, integración nativa con IAM y Terraform, plantillas
  gestionadas.
- **Negativas**: sandbox limita destinatarios a correos verificados; salir de
  sandbox requiere solicitud a AWS (no necesario para la demo).
- **Impacto**:
  - _Backend (US-009)_: utilidad de envío de correo + selección de plantilla por
    evento; manejo de fallos sin romper la transacción de negocio.
  - _Terraform (US-004)_: identidades/plantillas SES, permisos `ses:SendEmail`.
  - _QA_: verificar que el fallo de correo no bloquea la operación y que la
    notificación interna siempre se crea.
