# US-023 — Renovar la membresía y autorizar la renovación automática

| Campo               | Valor                                        |
| ------------------- | -------------------------------------------- |
| ID                  | US-023                                       |
| Épica               | [EP-03](../epicas/EP-03-membresias-pagos.md) |
| Tipo                | Historia de usuario                          |
| Responsable         | Backend + Frontend                           |
| Fase                | MVP                                          |
| Sprint              | Sprint 2                                     |
| Prioridad           | Alta                                         |
| Estimación relativa | 5                                            |
| Dependencias        | US-021, US-022                               |

## Historia

Como **socio con membresía vigente, por vencer, vencida o con deuda**, quiero **renovar mi membresía cuando lo necesite y decidir explícitamente si autorizo la renovación automática**, para **no perder el acceso a los servicios del club sin que se me cobre nada que yo no haya autorizado**.

## Contrato de API

`POST /payments` (member) para la renovación y `PATCH /members/me/auto-renew` (member) para activar/desactivar la autorización, según `docs/api/contratos-api.md` §5 y §4. El estado de la membresía y la preferencia se leen en `GET /members/me`.

## Reglas de negocio

RN-PAG-01 (mensual/anual), RN-PAG-03 (**la renovación automática es opcional y requiere autorización explícita del socio**), RN-PAG-06 (un socio con deuda o vencido puede iniciar sesión y pagar, pero no reservar), RN-PAG-07 (confirmación segura antes de cambiar el estado).

## Valor de negocio

La renovación es el flujo recurrente del negocio: sostiene los ingresos del club y evita que un socio quede fuera de servicio por olvido. Al mismo tiempo, la autorización explícita protege la confianza del socio: nadie queda suscrito a un cobro recurrente por omisión, que es exactamente el reclamo más habitual en plataformas de membresía.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y su cuenta ya fue activada alguna vez (`ACTIVE`, o `ACTIVE` con `membershipStatus` `EXPIRING_SOON`/`EXPIRED`/`DEBT`).

## Postcondiciones

- Tras una renovación confirmada, la vigencia se extiende según las reglas de cálculo definidas en US-021 y el `membershipStatus` queda `ACTIVE` con `outstandingBalance=0`.
- La preferencia `autoRenew` del socio refleja exactamente la última decisión explícita que tomó.

## Alcance de la renovación automática en esta historia

En alcance: **capturar, mostrar y revocar** la autorización explícita del socio, y que ninguna renovación ocurra sin ella. **No** está en alcance la ejecución de un cargo recurrente desatendido (tarjeta en archivo + planificador), que no está contemplada en ADR-0007 ni en los contratos vigentes y requiere una decisión previa del Arquitecto. Ver la sección "Decisión funcional pendiente" de [EP-03](../epicas/EP-03-membresias-pagos.md).

## Criterios de aceptación

1. Un socio con membresía vigente, por vencer, vencida o con deuda puede iniciar un pago de renovación desde la sección de membresía, reutilizando el checkout de US-022.
2. La sección de membresía muestra el estado real del socio: tipo de plan, `membershipStatus`, fecha de vencimiento y, si corresponde, el saldo pendiente.
3. Una renovación confirmada extiende la vigencia según las reglas de cálculo de US-021 (encadenada si la membresía está vigente; desde la confirmación si está vencida) y deja el saldo pendiente en cero.
4. Un socio con deuda o membresía vencida **puede** iniciar sesión y pagar (RN-PAG-06); el bloqueo de reservas asociado a ese estado se implementa en EP-04 y no forma parte de esta historia.
5. La renovación automática está **desactivada por defecto**: ninguna cuenta queda con `autoRenew=true` sin una acción explícita del socio (RN-PAG-03).
6. El socio puede activar la renovación automática con una acción explícita e inequívoca, ya sea marcando la opción durante el pago (`autoRenew=true` en `POST /payments`) o desde su sección de membresía (`PATCH /members/me/auto-renew`); en ambos casos la interfaz explica en lenguaje claro qué implica antes de confirmarla.
7. El socio puede **desactivar** la renovación automática en cualquier momento desde la misma sección, con efecto inmediato y confirmación visible del cambio.
8. El estado vigente de la preferencia se lee del backend (`GET /members/me`) y se muestra siempre que el socio consulte su membresía; no se infiere en el cliente.
9. `PATCH /members/me/auto-renew` solo puede modificar la preferencia del socio autenticado; un intento de modificar la de otro socio devuelve 403.
10. Un `autoRenew=true` enviado junto a un pago **fallido** no queda registrado como autorización efectiva: la preferencia solo se aplica cuando el pago se confirma (RN-PAG-07).
11. La regla "sin autorización explícita no hay renovación automática" se valida en el backend, no solo en la interfaz.
12. Ningún dato de tarjeta se guarda para "recordar" el medio de pago dentro del alcance de esta historia (RN-PAG-08).

## Casos alternativos / excepciones

- **Socio que renueva antes de vencer**: no pierde días; la vigencia nueva se encadena a la anterior.
- **Socio con deuda que paga un plan distinto al anterior** (p. ej. venía mensual y paga anual): se aplica el plan pagado y `membershipType` se actualiza.
- **Socio que activa y luego desactiva la renovación automática en la misma sesión**: prevalece la última acción explícita; queda registro de la decisión vigente.
- **Socio `PENDING`/`REJECTED`**: no puede renovar ni activar la preferencia (403 `MEMBER_NOT_APPROVED`).
- **Renovación automática autorizada pero sin ejecución automática disponible**: la interfaz no debe prometer un cobro automático que el sistema todavía no ejecuta; el texto debe reflejar la capacidad real entregada (ver "Alcance" arriba).

## Sugerencia de pruebas funcionales

- P-05: la renovación automática solo queda activa cuando el socio la autoriza explícitamente; por defecto está desactivada.
- P-09 (E2E): socio con `DEBT`/`EXPIRED` inicia sesión, renueva y queda `ACTIVE` sin saldo pendiente.
- Renovación anticipada de socio vigente → vigencia encadenada (sin pérdida de días).
- `PATCH /members/me/auto-renew` de otro socio → 403.
- `autoRenew=true` con pago rechazado → la preferencia no queda activada.

## Trazabilidad

- Épica: EP-03
- Reglas: RN-PAG-01, RN-PAG-03, RN-PAG-06, RN-PAG-07.
- Casos de prueba: P-05, P-09.
- Depende de: US-021 (cobro y cálculo de vigencia), US-022 (checkout reutilizado).
- Habilita: EP-04 (el bloqueo de reserva por deuda opera sobre el estado que deja esta historia), EP-07 (métricas de vencimientos y renovación).
