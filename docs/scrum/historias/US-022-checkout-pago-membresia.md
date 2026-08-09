# US-022 — Pagar la membresía desde la plataforma (checkout)

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-022                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Frontend                                     |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Crítica                                      |
| Estimación relativa | 5                                            |
| Dependencias        | US-020, US-021                               |

## Historia

Como **socio aprobado o con membresía por vencer**, quiero **pagar mi membresía con mi tarjeta desde la plataforma y ver de inmediato el resultado**, para **activar mi cuenta y poder usar los servicios del club sin trámites presenciales**.

## Contrato de API

`GET /memberships/plans` y `POST /payments` (member), según `docs/api/contratos-api.md` §5. La tokenización de la tarjeta ocurre en el cliente con Culqi.js usando la **llave pública** (ADR-0007).

## Reglas de negocio

RN-PAG-01 (mensual/anual), RN-PAG-04 (pago digital con tarjeta vía Culqi sandbox), RN-PAG-05 (no hay efectivo, Yape, Plin ni transferencias), RN-PAG-08 (los datos de tarjeta nunca llegan al backend), RN-ACT-07 (el socio aprobado debe pagar para quedar activo).

## Valor de negocio

Es la salida del callejón sin salida del Sprint 1: hoy `PendingApprovalPage` le dice al socio aprobado "solo falta pagar tu primera membresía" pero no le ofrece ninguna acción. Con esta historia el socio completa por sí mismo el último paso del alta y entra al área de socio, que es el momento en que el producto empieza a entregar valor.

## Precondiciones

- El socio tiene sesión iniciada con rol `member`.
- El socio está en estado `APPROVED` (primer pago) o `ACTIVE` (renovación/regularización).
- La llave pública de Culqi está disponible como variable de build del frontend (US-019).

## Postcondiciones

- Tras un pago exitoso, la consulta de perfil (`GET /members/me`) refleja `memberStatus=ACTIVE` y el guard `RequireActiveMember` deja entrar al socio al área `/socio`.

## Criterios de aceptación

1. Existe una pantalla de pago accesible desde la sección de membresía del socio y desde la pantalla de cuenta pendiente, donde se listan los planes obtenidos de `GET /memberships/plans` (US-020) con su precio formateado.
2. La pantalla de cuenta pendiente deja de ser un callejón sin salida: para un socio `APPROVED` muestra una acción principal visible que lleva al pago de la primera membresía (hoy solo informa "te avisaremos cuando el pago esté disponible").
3. Los datos de tarjeta se capturan y tokenizan exclusivamente con Culqi.js usando la llave pública; **ningún** dato de tarjeta (número, CVV, vencimiento) se envía a la API propia, se guarda en estado persistente del cliente, ni se registra en consola o telemetría (RN-PAG-08).
4. Al confirmar, el frontend envía a `POST /payments` únicamente `membershipType`, `culqiToken`, `idempotencyKey` y, si corresponde, `autoRenew`.
5. La `idempotencyKey` se genera una vez por intento de compra y se **reutiliza** en los reintentos del mismo intento (incluido el doble clic), de modo que un reenvío no genere un cargo nuevo (ADR-0007).
6. Mientras el pago está en curso, el botón de confirmación queda deshabilitado con indicador de carga y la pantalla no permite enviar un segundo pago simultáneo.
7. Pago exitoso: se muestra una confirmación con el plan pagado, el monto y la fecha hasta la que queda vigente la membresía, se invalida la consulta de perfil en caché y el socio puede entrar al área `/socio` sin necesidad de volver a iniciar sesión.
8. Pago rechazado (`PAYMENT_FAILED`): se muestra un mensaje claro y accionable ("tu tarjeta fue rechazada, intenta con otra"), sin exponer detalles técnicos del proveedor, y el socio puede reintentar generando un token nuevo.
9. Pago duplicado (`PAYMENT_DUPLICATE`): la interfaz muestra el resultado del pago original y **no** ofrece cobrar de nuevo.
10. Pago en `PENDING_CONFIRMATION`: la interfaz informa que el pago está en verificación, no promete la activación, y permite consultar el estado más tarde desde el historial (US-025).
11. Errores de validación (400) se muestran campo a campo; 401 lleva al login; 403 `MEMBER_NOT_APPROVED` explica que la cuenta todavía no está aprobada.
12. La pantalla es responsive y accesible (etiquetas, foco, mensajes de error asociados a cada campo, operable por teclado), con estados de carga y error consistentes con el design foundation.
13. La interfaz no ofrece ningún medio de pago distinto de tarjeta (RN-PAG-05).

## Casos alternativos / excepciones

- **El socio cierra la pantalla durante el pago**: al volver, el historial (US-025) o el estado del perfil reflejan el resultado real; la interfaz no asume éxito.
- **Culqi.js no carga** (bloqueado o sin red): se muestra un error explícito y no se habilita el envío del formulario, evitando enviar datos de tarjeta por un camino alternativo.
- **Socio ya `ACTIVE` que entra a la pantalla de cuenta pendiente**: se lo redirige al área de socio (comportamiento ya existente del guard).
- **Sesión expirada al confirmar**: se solicita reingreso y, al volver, no se dispara un cobro automático sin confirmación explícita del socio.

## Sugerencia de pruebas funcionales

- P-02 (E2E): socio `APPROVED` → paga con tarjeta de prueba → queda `ACTIVE` → accede a `/socio`.
- P-03: tarjeta de rechazo → mensaje de error, socio sigue sin acceso al área de socio.
- P-04 (UI): doble clic en confirmar → un solo cargo, misma `idempotencyKey`.
- P-08: revisión de la petición enviada y del almacenamiento del navegador: sin PAN/CVV.
- Accesibilidad y responsive del formulario de pago.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-01/04/05/08, RN-ACT-07.
- Casos de prueba: P-02, P-03, P-04, P-08.
- Depende de: US-020 (planes), US-021 (`POST /payments`), US-019 (llave pública en el build).
- Habilita: US-023 (renovación desde la misma pantalla), cierre funcional de RN-ACT-07 y del caso A-15 de la matriz de trazabilidad.
