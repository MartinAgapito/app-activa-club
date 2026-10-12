# US-070 — Ver mi situación y mi próxima reserva al entrar (inicio del socio)

| Campo               | Valor                                                    |
| ------------------- | -------------------------------------------------------- |
| ID                  | US-070                                                   |
| Épica               | [EP-08](../epicas/EP-08-experiencia-usuario-interfaz.md) |
| Tipo                | Historia de usuario (bloque B — inicio útil)             |
| Responsable         | Frontend                                                 |
| Fase                | MVP (propuesta)                                          |
| Sprint              | Sprint 4B (propuesto)                                    |
| Prioridad           | Alta                                                     |
| Estimación relativa | 3                                                        |
| Dependencias        | US-068                                                   |

## Contexto

`/socio` (`MemberDashboardPage`) es hoy un placeholder "en construcción": el socio entra y no ve nada. El inicio completo, con `canReserve` calculado en el servidor, avisos recientes y resumen de pagos, es US-056 (EP-07, Sprint 5), que depende de un endpoint que aún no existe (`GET /dashboard/member`, US-055). Esta historia entrega **ya** un inicio útil con los endpoints existentes, construido de forma que US-056 lo enriquezca sin rehacerlo.

## Historia

Como **socio**, quiero **ver al entrar cómo está mi membresía, cuándo vence, si debo pagar, cuál es mi próxima reserva y accesos directos a lo que más uso**, para **saber de un vistazo si puedo usar el club y qué hacer si no**.

## Contrato de API

Solo endpoints ya implementados (`docs/api/contratos-api.md`):

- `GET /members/me` (§4): nombre, `membershipStatus`, `membershipType`, `membershipEndsAt`, `outstandingBalance`.
- `GET /reservations?scope=me&from=<ahora>` (§7): próxima reserva activa.
- `GET /payments?limit=1` (§5), opcional: fecha y estado del último pago.

Sin cambios en el servidor.

## Reglas de negocio

RN-PAG-06 y RN-RES-12 (un socio con deuda o membresía vencida puede entrar y pagar, pero no reservar). La interfaz solo **anticipa** el bloqueo con la función existente `getReservationBlock` (`apps/web/src/reservations/eligibility.ts`); el servidor sigue rechazando la reserva igual.

## Valor de negocio

Elimina la pantalla vacía que el dueño del producto señaló en la prueba extremo a extremo y es la primera impresión de la demostración.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Muestra un saludo con el nombre de pila del socio.
2. Un bloque **"Mi membresía"** muestra la etiqueta del estado en español (Activa, Por vencer, Vencida, Con deuda, Sin membresía), el tipo de plan (mensual o anual) y la fecha de vencimiento en hora de Lima; si está activa o por vencer, también los días que faltan.
3. Si el socio tiene deuda o la membresía no está vigente (`getReservationBlock` distinto de nulo), aparece un **aviso destacado** con el motivo en lenguaje claro y el botón "Pagar o renovar membresía", que lleva a `/socio/membresia`. En 375 px el aviso es visible sin desplazarse.
4. Si la membresía está "Por vencer", aparece un aviso informativo con el acceso a renovar, sin bloquear "Nueva reserva".
5. Un bloque **"Mi próxima reserva"** muestra la reserva activa más cercana (confirmada, aprobada o pendiente de aprobación) con instalación, fecha y franja en hora de Lima y estado; un acceso "Ver todas mis reservas" lleva a `/socio/reservas/mias`. Sin reservas próximas, invita a reservar.
6. Un bloque de **accesos rápidos** ofrece "Nueva reserva", "Mis reservas", "Mi membresía" y "Mis pagos". Cuando el socio no puede reservar, "Nueva reserva" aparece deshabilitada con el motivo visible, nunca oculta.
7. "Nueva reserva" lleva a `/socio/reservas`; cuando US-072 esté disponible, abre directamente el asistente.
8. Cada bloque carga, falla y se reintenta de forma independiente: si falla la próxima reserva, la membresía y los accesos se muestran igual.
9. La página está construida como **bloques independientes**, cada uno con su propia fuente de datos, para que US-056 pueda cambiar la fuente del bloque de membresía a `GET /dashboard/member` y agregar los bloques de avisos y pagos sin reescribir la página.
10. Es responsive (en móvil el orden es: aviso, membresía, accesos, próxima reserva) y accesible: cada bloque es una sección con título.

## Casos alternativos / excepciones

- **Socio migrado sin `membershipEndsAt`**: se muestra el estado sin fecha, sin inventar un vencimiento.
- **Último pago en verificación**: el bloque de membresía indica "Pago en verificación" si `GET /payments` lo informa; si ese pedido falla, el bloque se muestra sin esa línea.
- **Avisos recientes y resumen de pagos**: fuera de esta historia (US-041 y US-056).

## Sugerencia de pruebas funcionales

- Socio al día con una reserva mañana → membresía activa, próxima reserva y "Nueva reserva" habilitada.
- Socio con deuda → aviso con motivo, botón de pago y "Nueva reserva" deshabilitada; si intenta reservar por URL, el servidor rechaza (R-19).
- Fallo simulado de `GET /reservations` → el resto del inicio se muestra.
- Revisión en 375 px.

## Trazabilidad

- Épica: EP-08 (bloque B).
- Reglas: RN-PAG-06, RN-RES-12.
- Casos de prueba: UX-12, UX-05, R-19 (por interfaz), T-01, T-03.
- Depende de: US-068.
- Habilita: US-056 (la enriquece; ver EP-08, "Relación con EP-07").
