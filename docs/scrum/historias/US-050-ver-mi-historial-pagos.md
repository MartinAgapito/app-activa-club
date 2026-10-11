# US-050 — Ver mi historial de pagos en la plataforma

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-050                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Deuda técnica de EP-03 (historia de usuario) |
| Responsable         | Frontend                                     |
| Fase                | MVP                                          |
| Sprint              | Sprint 5 (arrastre de EP-03)                 |
| Prioridad           | Media                                        |
| Estimación relativa | 2                                            |
| Dependencias        | US-025 (servidor implementado)               |

## Contexto

US-025 especificó el historial de pagos para el socio y para el administrador. El servidor quedó implementado y probado (`GET /payments`, `GET /payments/{paymentId}`), pero **ninguna de las dos pantallas existe**: `/socio/pagos` (`PaymentsPage`) sigue siendo un placeholder. Esta historia entrega la vista del socio (criterios 2, 8, 10 y 11 de US-025); la del administrador es US-053.

## Historia

Como **socio**, quiero **ver el historial de mis pagos con su fecha, monto, plan y estado**, para **saber qué pagué, hasta cuándo estoy cubierto y verificar un cobro cuando tenga dudas**.

## Contrato de API

`GET /payments` (member: solo los propios) y `GET /payments/{paymentId}`, según `docs/api/contratos-api.md` §5. Paginación por cursor `{ items, nextCursor }`. Sin cambios en el servidor.

## Reglas de negocio

RN-PAG-04, RN-PAG-08 (sin datos de tarjeta en pantalla).

## Valor de negocio

Es la evidencia del socio sobre lo que pagó y el lugar donde ve que un pago "en verificación" ya se confirmó. Hoy el dato existe pero el socio no tiene dónde verlo.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. En `/socio/pagos` el socio ve sus pagos del más reciente al más antiguo, con fecha (hora de Lima), plan, monto en soles y estado.
2. Los estados se muestran con etiquetas en español: `SUCCEEDED` "Pagado", `PENDING_CONFIRMATION` "En verificación", `FAILED` "Rechazado"; nunca el código crudo.
3. Un pago rechazado muestra su motivo legible si existe.
4. Un pago "en verificación" se actualiza al recargar cuando el webhook lo confirma.
5. La lista se pagina con "cargar más" usando `nextCursor`.
6. Sin pagos, se muestra un estado vacío informativo ("todavía no registras pagos"); para un socio migrado no se sugiere que faltan datos, porque los pagos históricos no se migran (matriz de alcance §1).
7. No se muestra ningún dato de tarjeta ni identificador de Stripe.
8. La pantalla es responsive, accesible y tiene estados de carga y error.

## Casos alternativos / excepciones

- **Cursor inválido o vencido** (400): la lista vuelve a la primera página.
- **Descargar un comprobante o una factura**: fuera de alcance (facturación electrónica, matriz §3).

## Sugerencia de pruebas funcionales

- Socio con pagos exitoso, fallido y en verificación → tres filas con su etiqueta.
- Socio sin pagos → estado vacío.
- Paginación con más de una página.

## Trazabilidad

- Épica: EP-03 (deuda técnica de US-025).
- Reglas: RN-PAG-04, RN-PAG-08.
- Casos de prueba: P-08 (superficie en interfaz), T-03.
- Depende de: US-025 (servidor).
- Habilita: US-056 (resumen breve de pagos del dashboard del socio).
