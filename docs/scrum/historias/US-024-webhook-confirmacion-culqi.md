# US-024 — Confirmar pagos mediante el webhook de Culqi

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-024                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Backend                                      |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Alta                                         |
| Estimación relativa | 5                                            |
| Dependencias        | US-019, US-021                               |

## Historia

Como **socio que pagó su membresía**, quiero **que mi membresía se active igual aunque la respuesta del pago se pierda en el camino**, para **no quedar bloqueado ni tener que reclamar por un pago que el club ya cobró**.

## Contrato de API

`POST /payments/webhook` — ruta **pública** (sin Cognito Authorizer) con **verificación de firma** de Culqi; responde 202. Según `docs/api/contratos-api.md` §5 y [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md).

## Reglas de negocio

RN-PAG-07 (el estado de membresía solo se actualiza con confirmación segura del resultado del pago), RN-PAG-08 (nunca datos de tarjeta ni secretos). Riesgo técnico RT-14 (endpoint público protegido por firma).

## Valor de negocio

Un pago cobrado que no se refleja en el sistema es el peor fallo posible del módulo: el socio pierde el dinero y el acceso a la vez, y el club pierde credibilidad. El webhook es la red de seguridad que reconcilia el estado cuando la respuesta síncrona se pierde (timeout, corte de red, error de escritura), sin volver a cobrar y sin depender de que el socio reintente.

## Precondiciones

- El endpoint público está desplegado sin authorizer (US-019).
- Existe el flujo de cobro y la entidad `Payment` con su `idempotencyKey` (US-021).
- El secreto de verificación de firma de Culqi está disponible como secreto gestionado.

## Postcondiciones

- El `Payment` referido queda en su estado definitivo (`SUCCEEDED` o `FAILED`) y, si corresponde, la membresía del socio queda activada/extendida exactamente una vez.

## Criterios de aceptación

1. `POST /payments/webhook` con firma válida procesa el evento y responde 202.
2. La firma se verifica **siempre** antes de leer o aplicar cualquier efecto del evento; una firma inválida o ausente se rechaza (4xx), no modifica ningún estado y queda registrada como intento sospechoso.
3. El procesamiento es **idempotente**: recibir el mismo evento N veces produce exactamente el mismo estado final que recibirlo una vez, sin duplicar `MembershipPeriod` ni extender la vigencia dos veces.
4. Un evento de cargo exitoso sobre un pago en `PENDING_CONFIRMATION` lo transiciona a `SUCCEEDED` y aplica la activación/extensión de membresía con las mismas reglas de cálculo de US-021.
5. Un evento de cargo exitoso sobre un pago que ya está `SUCCEEDED` (porque la ruta síncrona ya lo confirmó) no produce ningún cambio adicional y responde 202.
6. Un evento de cargo fallido transiciona el pago a `FAILED` con `failureReason` y **no** activa ninguna membresía.
7. Un evento que referencia un pago inexistente o no reconocible se responde sin efectos y se registra para diagnóstico, sin exponer información interna al emisor.
8. El endpoint no requiere token de Cognito, pero **no** acepta ninguna operación basada solo en el contenido del cuerpo sin firma válida.
9. El cuerpo del evento, los logs y los ítems persistidos no contienen PAN, CVV ni secretos de Culqi (RN-PAG-08).
10. La ruta síncrona (US-021) y la ruta del webhook **convergen** al mismo estado final sin importar cuál llegue primero.
11. Los errores de procesamiento quedan observables (log estructurado + alarma prevista por ADR-0008) para poder detectar pagos sin reconciliar.

## Casos alternativos / excepciones

- **Webhook llega antes que la respuesta síncrona**: el webhook confirma y activa; la respuesta síncrona posterior no vuelve a extender la vigencia.
- **Reintentos de Culqi por timeout de nuestra respuesta**: el procesamiento idempotente evita efectos duplicados.
- **Evento fuera de orden** (fallido después de exitoso para el mismo cargo): prevalece el estado ya confirmado; el caso se registra para revisión y no revierte una membresía activada.
- **Secreto de firma rotado**: se documenta el procedimiento de rotación; durante la rotación no debe aceptarse ningún evento sin firma verificable.
- **Intento de abuso** (llamadas al endpoint público sin firma): se rechazan, no consumen lógica de negocio y quedan registradas.

## Sugerencia de pruebas funcionales

- P-06: webhook con firma válida confirma el pago de forma idempotente (envío repetido → un solo efecto).
- P-07: webhook con firma inválida → rechazado, sin cambio de estado.
- Webhook sobre pago ya `SUCCEEDED` → 202 sin efectos.
- Webhook de cargo fallido → `FAILED`, membresía intacta.
- Convergencia: mismo pago confirmado por ambas rutas → una sola extensión de vigencia.
- P-08: cuerpo y logs del webhook sin datos sensibles.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-07, RN-PAG-08. ADR-0007, RT-14.
- Casos de prueba: P-06, P-07, P-08.
- Depende de: US-019 (ruta pública desplegada), US-021 (entidad de pago y reglas de vigencia).
- Habilita: US-026 (verificación de seguridad de la superficie de pagos), confiabilidad del estado que consume EP-04.
