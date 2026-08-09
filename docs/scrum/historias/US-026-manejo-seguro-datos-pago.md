# US-026 — Garantizar el manejo seguro de los datos de pago

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-026                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Tarea técnica (verificación transversal)     |
| Responsable         | Backend + DevOps (con QA)                    |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Alta                                         |
| Estimación relativa | 3                                            |
| Dependencias        | US-021, US-024                               |

## Objetivo

Verificar y dejar evidencia de que toda la superficie de pagos de EP-03 cumple RN-PAG-08: **en ningún punto del sistema** existe número de tarjeta (PAN), CVV, fecha de vencimiento ni secreto de Culqi —ni en tránsito, ni en almacenamiento, ni en logs, ni en el repositorio—, y que la separación cliente/servidor de ADR-0007 se respeta tal como fue decidida.

## Entregable

1. Un checklist de verificación de datos sensibles de pago, ejecutado sobre el ambiente `dev` real y adjunto como evidencia en el Pull Request de cierre del sprint.
2. Los ajustes de código/configuración que la verificación revele necesarios (p. ej. ampliar la lista de campos prohibidos del logger, redactar campos en el manejo de errores del cliente HTTP de pagos, o corregir un permiso IAM sobreamplio sobre el secreto).
3. La sección correspondiente de `docs/testing/matriz-trazabilidad.md` §3 actualizada con el resultado real de P-08.

Esta historia **no** construye funcionalidad nueva: audita, corrige desviaciones puntuales y deja evidencia. Los criterios de no persistencia de datos de tarjeta también son criterios de aceptación de US-021, US-022 y US-024; aquí se verifican de forma consolidada.

## Valor de negocio

Manejar mal un dato de tarjeta es el riesgo de mayor impacto del proyecto: expone al club a una brecha, es irreversible una vez ocurrido y es exactamente lo que un jurado o un auditor va a preguntar sobre un módulo de pagos. Dejar la evidencia documentada convierte una afirmación ("no guardamos tarjetas") en algo demostrable.

## Reglas de negocio

RN-PAG-08 (nunca se almacenan datos de tarjeta, CVV ni secretos de Culqi), RN-PAG-04 (todo pago pasa por Culqi sandbox). Decisión: [ADR-0007](../../architecture/adr/ADR-0007-culqi-sandbox-idempotencia-pagos.md) (tokenización en el cliente, cargo server-side, secreto gestionado).

## Precondiciones

- El flujo de pago está implementado y desplegado en `dev` (US-021, US-022, US-024).

## Postcondiciones

- El caso P-08 de la matriz de trazabilidad queda en estado "Pasa" con evidencia asociada, o con los hallazgos corregidos y reverificados.

## Criterios de aceptación

1. **Petición a la API propia**: ningún request a `POST /payments` acepta ni transporta PAN, CVV ni fecha de vencimiento; el esquema de validación rechaza campos no previstos.
2. **Almacenamiento**: ningún ítem de DynamoDB (`Payment`, `PaymentIdempotency`, `Member`, `MembershipPeriod`, `AuditLog`) contiene PAN, CVV ni llaves de Culqi; se verifica inspeccionando ítems reales generados por un pago de prueba.
3. **Logs**: ningún log de CloudWatch de las Lambdas de pago y webhook contiene `culqiToken`, PAN, CVV, la llave privada ni el secreto de firma; se verifica ejecutando un pago exitoso, uno fallido y un webhook, y revisando los grupos de log.
4. La lista de campos prohibidos del logger cubre al menos `password`, `culqiToken`, `cvv`, `cardNumber`, `culqiSecretKey` y cualquier campo sensible que la implementación de EP-03 haya introducido; se agregan los que falten.
5. **Errores**: los mensajes de error devueltos al cliente y los errores registrados no reproducen el cuerpo crudo de la petición de pago ni la respuesta cruda del proveedor.
6. **Repositorio**: ninguna llave privada ni secreto de firma de Culqi está versionado; `.env.example` documenta solo los nombres de variable, nunca valores reales.
7. **Frontend**: los datos de tarjeta se manejan exclusivamente dentro de Culqi.js; no se guardan en `localStorage`, `sessionStorage`, estado persistido ni telemetría, y no se envían a la API propia.
8. **Secretos**: el permiso IAM de las Lambdas de pago permite leer únicamente el secreto de Culqi (mínimo privilegio), y ningún otro componente lo puede leer.
9. **Endpoint público**: `POST /payments/webhook` no aplica ningún efecto sin firma verificada (verificación cruzada con US-024).
10. La evidencia (capturas o salidas de consulta, con datos de prueba) queda adjunta al Pull Request; no se incluye ningún dato real de tarjeta en la evidencia.
11. Cualquier hallazgo se corrige dentro del sprint o se documenta como bug con severidad y responsable si excede el alcance.

## Casos alternativos / excepciones

- Si la verificación encuentra un dato sensible persistido, se trata como **bug bloqueante**: se corrige, se purga el dato del ambiente `dev` y se reverifica antes de cerrar el sprint.
- Si Culqi devuelve en su respuesta datos que no deben persistirse (p. ej. últimos dígitos de la tarjeta), se define explícitamente qué se guarda; por defecto, no se persiste nada más allá de lo previsto en el modelo de datos §3.5.
- Si la rotación del secreto no está documentada, se documenta en `docs/deployment/despliegue-dev.md` como parte de esta historia.

## Sugerencia de pruebas funcionales

- P-08: recorrido completo (pago exitoso, pago fallido, webhook) inspeccionando request, respuesta, ítems de DynamoDB y logs.
- Búsqueda de patrones de secreto/PAN en el repositorio y en el bundle publicado del frontend.
- Intento de enviar `cardNumber`/`cvv` en el body de `POST /payments` → rechazado por validación.
- Revisión del almacenamiento del navegador tras un pago.
- Verificación del permiso IAM del rol de la Lambda de pagos sobre el secreto.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-04, RN-PAG-08. ADR-0007.
- Casos de prueba: P-08 (principal), refuerzo de P-06 y P-07.
- Depende de: US-021, US-024 (y la implementación de frontend de US-022).
- Habilita: cierre del sprint con evidencia de cumplimiento; base para la revisión de seguridad de EP-04.
