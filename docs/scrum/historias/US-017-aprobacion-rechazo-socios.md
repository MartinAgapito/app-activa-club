# US-017 — Aprobar o rechazar solicitudes de socios nuevos

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-017                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Backend + Frontend                                      |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Alta                                                    |
| Estimación relativa | 5                                                       |
| Dependencias        | US-011, US-016                                          |

## Historia

Como **administrador**, quiero **revisar y aprobar o rechazar las solicitudes de socios nuevos**, para **controlar quién ingresa al club y en qué estado queda su cuenta**.

## Contrato de API

`GET /members?status=PENDING`, `GET /members/{memberId}`, `POST /members/{memberId}/approve`, `POST /members/{memberId}/reject`, según `docs/api/contratos-api.md` §4.

## Reglas de negocio

RN-ACT-06 (el socio nuevo queda pendiente hasta aprobación/rechazo), RN-ADM-01 (gestión de socios), RN-ADM-02 (aprobación/rechazo de solicitudes), RN-ACT-07 (tras la aprobación debe pagar su primera membresía).

## Valor de negocio

La aprobación administrativa es el control de admisión del club: garantiza que solo ingresen socios validados y deja el estado listo para el paso de pago de membresía.

## Precondiciones

- Existen socios en estado `PENDING` producto del registro (US-016).
- El usuario autenticado tiene rol `admin`.

## Postcondiciones

- La solicitud transiciona a `APPROVED` o `REJECTED`; se registra auditoría y se dispara la notificación de evento correspondiente prevista por el contrato.

## Criterios de aceptación

1. `GET /members?status=PENDING` (solo `admin`) lista las solicitudes pendientes con datos suficientes para decidir, con paginación por cursor.
2. `GET /members/{memberId}` (solo `admin`) devuelve el detalle de un socio.
3. `POST /members/{memberId}/approve` transiciona `PENDING → APPROVED`, registra auditoría `MEMBER_APPROVED` y deja constancia de que el socio aún debe pagar su primera membresía.
4. `POST /members/{memberId}/reject` con un motivo transiciona `PENDING → REJECTED` y registra auditoría.
5. Aprobar o rechazar un socio que no está en `PENDING` devuelve 409 `CONFLICT`; un `memberId` inexistente devuelve 404 `NOT_FOUND`.
6. Un usuario sin rol `admin` recibe 403 `FORBIDDEN`; sin sesión, 401 `UNAUTHENTICATED`.
7. La interfaz de administración muestra la lista, permite ver el detalle y ejecutar aprobar/rechazar con confirmación, reflejando el nuevo estado.
8. Las transiciones de estado y la autorización por rol se validan en el backend, no solo en el frontend.

## Casos alternativos / excepciones

- Dos administradores actúan sobre la misma solicitud: la segunda acción encuentra un estado ya no `PENDING` y recibe 409, sin doble transición.
- Rechazo sin motivo: la interfaz exige el motivo antes de enviar.

## Sugerencia de pruebas funcionales

- Admin lista pendientes → aprueba → estado `APPROVED` + auditoría.
- Admin rechaza con motivo → estado `REJECTED` + auditoría.
- Aprobar socio ya aprobado → `CONFLICT`.
- `member` intenta aprobar → `FORBIDDEN`.
- `memberId` inexistente → `NOT_FOUND`.

## Trazabilidad

- Épica: EP-02
- Depende de: US-011 (endpoints), US-016 (socios pendientes).
- Habilita: el pago de primera membresía (EP-03) para socios aprobados.
