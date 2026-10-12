# US-080 — Devolver el nombre de los socios participantes en el detalle de una reserva (servidor)

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-080                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend                                            |
| Fase                | MVP                                                |
| Sprint              | Sprint 5                                           |
| Estado              | Ready                                              |
| Prioridad           | Media                                              |
| Estimación relativa | 2                                                  |
| Dependencias        | US-033 (detalle de reserva implementado)           |

## Historia

Como **socio titular de una reserva o administrador**, quiero **ver el nombre de cada socio que participa en la reserva**, para **saber con quién está reservada la instalación sin ver "Socio del club" en cada fila**.

## Contrato de API

`GET /reservations/{reservationId}` (member titular | admin): cada elemento de `participants` agrega `member: { memberId, firstName, lastName } | null` (tipo `MemberNameSummary`), según la adenda del 2026-10-12 de `docs/api/contratos-api.md` §7 y §12. Patrón de acceso #31 del modelo de datos; decisión en [ADR-0014](../../architecture/adr/ADR-0014-filtros-secundarios-y-nombres-en-lectura.md). Sin cambios de Terraform: la Lambda `reservations-get-by-id` ya tiene `dynamodb:GetItem`.

## Reglas de negocio

RN-RES-03 (participantes socios), RN-RES-06 (titular). Privacidad de ADR-0009: solo nombre y apellido de otro socio.

## Valor de negocio

El panel de detalle de reservas del socio (US-074) y del administrador (US-077) ya existe, pero muestra a los acompañantes sin nombre. Es el dato que el administrador necesita para verificar quién entra al club y el que el titular espera ver de la reserva que armó.

## Precondiciones

- Sesión con rol `member` (titular de la reserva) o `admin`.

## Postcondiciones

- Ninguna; es de solo lectura.

## Criterios de aceptación

1. Cada participante `HOLDER` o `MEMBER` del detalle incluye `member` con `memberId`, `firstName` y `lastName` del socio, leídos del `Member` (no del texto de la reserva).
2. Cada participante `GUEST` incluye `member: null` y conserva `guestName` y `guestDni` como hoy.
3. Un socio participante que ya no se puede resolver devuelve `member: null`; la respuesta sigue siendo 200.
4. `member` nunca incluye DNI, correo, teléfono, `memberStatus`, `membershipStatus` ni `outstandingBalance` (la proyección de lectura se limita a `memberId`, `firstName`, `lastName`).
5. La visibilidad del detalle no cambia: un socio que no es titular recibe 404 `NOT_FOUND` (también si es participante), el administrador ve cualquier reserva.
6. Los `memberId` repetidos se resuelven una sola vez, con lecturas por clave en paralelo (≤ 31), sin `Scan`.
7. Los demás campos del detalle no cambian (compatibilidad hacia atrás, contratos §12.2).
8. `packages/shared-types` define `MemberNameSummary` y `ReservationHolderSummary` queda como alias suyo, sin romper a sus consumidores.

## Casos alternativos / excepciones

- **Reserva sin acompañantes**: solo el `HOLDER`, con su nombre.
- **Mostrar el nombre en la interfaz**: el ajuste del panel de US-074/US-077 es una tarea de frontend aparte (cambiar "Socio del club" por `member.firstName member.lastName`, con ese texto como respaldo cuando `member` es `null`).

## Sugerencia de pruebas funcionales

- Reserva con titular, un socio y un invitado → dos `member` con nombre y uno `null`.
- Socio participante borrado del fixture → `member: null`, 200.
- Socio no titular que pide el detalle → 404.
- La respuesta no contiene `dni`, `email` ni `phone` en ningún `member`.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-03, RN-RES-06.
- Contrato: `docs/api/contratos-api.md` §7 y §12; modelo de datos patrón #31; ADR-0009, ADR-0014.
- Depende de: US-033.
- Habilita: el nombre de los participantes en US-074 y US-077.
