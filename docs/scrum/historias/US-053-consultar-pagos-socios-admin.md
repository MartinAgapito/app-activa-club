# US-053 — Consultar los pagos de los socios

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-053                                     |
| Épica               | [EP-06](../epicas/EP-06-administracion.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Frontend                                   |
| Fase                | MVP                                        |
| Sprint              | Sprint 5                                   |
| Prioridad           | Media                                      |
| Estimación relativa | 3                                          |
| Dependencias        | US-025 (servidor implementado)             |

## Historia

Como **administrador**, quiero **consultar los pagos de los socios filtrando por estado o por socio**, para **atender reclamos y verificar un cobro sin depender del panel de la pasarela de pagos**.

## Contrato de API

`GET /payments?memberId=&status=&cursor=&limit=` y `GET /payments/{paymentId}` (admin), según `docs/api/contratos-api.md` §5, ya implementados en US-025. El servidor exige **al menos uno** de los dos filtros (400 sin ninguno). `GET /memberships/plans` (§5) para mostrar los planes vigentes. Para filtrar por socio a partir de su DNI: `GET /members/lookup?dni=` (§4). Pantalla existente como placeholder: `/admin/membresias` (`MembershipsAdminPage`).

## Reglas de negocio

RN-ADM-07 (consultar pagos), RN-ADM-03, RN-PAG-08 (sin datos de tarjeta en pantalla).

## Valor de negocio

Cierra la parte administrativa de US-025, que quedó solo en el servidor. Es la herramienta para responder "¿me cobraron dos veces?" o "¿por qué no se activó mi membresía?" desde el club.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. En `/admin/membresias` el administrador ve los planes vigentes (mensual y anual) con su precio.
2. El administrador consulta pagos por estado (pagados, en verificación, rechazados) y ve fecha, plan, monto, estado y un acceso al detalle del socio que pagó, del más reciente al más antiguo, con paginación. Mostrar el nombre del socio en cada fila no está en la respuesta del contrato y no se exige.
3. El administrador puede filtrar por socio ingresando su DNI; puede combinarlo con el estado.
4. La pantalla nunca hace una consulta sin filtro: por defecto muestra los pagos rechazados o en verificación (los que suelen originar consultas), y el administrador cambia el filtro desde ahí.
5. El detalle de un pago muestra además el motivo de rechazo si existe, la fecha de confirmación y si se solicitó renovación automática; nunca datos de tarjeta, `stripePaymentMethodId` ni secretos. El `stripePaymentIntentId` se muestra solo en el detalle, como referencia para buscar el cobro en la pasarela.
6. Al llegar desde el detalle de un socio (US-051), la lista aparece ya filtrada por ese socio.
7. Estados con etiquetas en español; estados de carga, error, vacío ("no hay pagos con este filtro") y paginación; responsive y accesible.

## Casos alternativos / excepciones

- **DNI de un socio sin pagos**: lista vacía con el filtro visible.
- **Registrar un pago manual o anular un pago**: fuera de alcance (matriz §3).
- **Totales de recaudación por período**: no está en el contrato; las cifras agregadas de pagos son del dashboard (US-057).

## Sugerencia de pruebas funcionales

- AD-03: filtro por estado `FAILED` → solo rechazados.
- Filtro por DNI de un socio con pagos → solo los suyos.
- Detalle de un pago: sin datos sensibles (T-04).

## Trazabilidad

- Épica: EP-06
- Reglas: RN-ADM-07, RN-ADM-03, RN-PAG-08.
- Casos de prueba: AD-03, T-04.
- Depende de: US-025 (servidor).
- Habilita: —
