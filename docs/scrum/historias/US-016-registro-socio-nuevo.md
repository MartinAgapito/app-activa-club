# US-016 — Registrarse como socio nuevo

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-016                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Backend + Frontend                                      |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Alta                                                    |
| Estimación relativa | 5                                                       |
| Dependencias        | US-011                                                  |

## Historia

Como **persona que no figura en la data on-premise**, quiero **registrarme como socio nuevo con mis datos**, para **solicitar mi ingreso al club y, tras la aprobación, poder operar en la plataforma**.

## Contrato de API

`POST /registration` (público), según `docs/api/contratos-api.md` §3.

## Reglas de negocio

RN-ACT-05 (quien no figura en on-premise puede registrarse), RN-ACT-06 (queda pendiente hasta aprobación/rechazo), RN-ACT-03 (un DNI, una cuenta digital), RN-ACT-07 (tras aprobación debe pagar su primera membresía para quedar activo — pago fuera de EP-02).

## Valor de negocio

El registro habilita la incorporación de socios nuevos sin data legada, ampliando la base de usuarios más allá de la migración.

## Precondiciones

- El DNI y el correo no están asociados a ninguna cuenta existente.

## Postcondiciones

- Se crea un `Member` con `origin=NEW` y `memberStatus=PENDING`, y un usuario Cognito (grupo `member`); el socio no puede reservar hasta ser aprobado y pagar.

## Criterios de aceptación

1. Con DNI, correo, contraseña, nombres, apellidos y teléfono válidos, `POST /registration` crea el socio en estado `PENDING` y el usuario Cognito, respondiendo 201 con `memberId` y `memberStatus=PENDING`.
2. Si el DNI ya existe, se devuelve 409 `DNI_ALREADY_USED`; si el correo ya existe, 409 `EMAIL_ALREADY_USED`; ambos con mensaje claro en la interfaz.
3. Datos inválidos devuelven 400 `VALIDATION_ERROR`, mostrados campo a campo.
4. La unicidad de DNI y correo se valida en el backend, no solo en el frontend.
5. La contraseña la gestiona Cognito y nunca se almacena en DynamoDB.
6. Tras el registro, la interfaz informa que la solicitud quedó pendiente de aprobación administrativa y que, una vez aprobada, deberá pagar su primera membresía.
7. Un socio `PENDING` puede iniciar sesión, pero no puede reservar (las capacidades de pago/reserva pertenecen a épicas posteriores).
8. El formulario es responsive, accesible y con estados de carga y error.

## Casos alternativos / excepciones

- Persona que en realidad sí está migrada intenta registrarse: si su DNI ya existe, se devuelve conflicto y se le orienta a activar su cuenta (US-013).
- Reintento con los mismos datos ya registrados: conflicto de unicidad, sin crear duplicados.

## Sugerencia de pruebas funcionales

- Datos válidos y únicos → socio `PENDING` creado.
- DNI ya usado → `DNI_ALREADY_USED`.
- Correo ya usado → `EMAIL_ALREADY_USED`.
- Datos inválidos → `VALIDATION_ERROR`.
- Login de socio `PENDING` → acceso limitado, sin reservar.

## Trazabilidad

- Épica: EP-02
- Depende de: US-011 (endpoint provisionado).
- Habilita: US-017 (aprobación/rechazo de socios pendientes).
