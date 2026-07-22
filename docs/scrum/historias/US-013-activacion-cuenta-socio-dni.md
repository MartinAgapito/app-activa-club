# US-013 — Activar cuenta de socio migrado con DNI

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-013                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Backend + Frontend                                      |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Alta                                                    |
| Estimación relativa | 8                                                       |
| Dependencias        | US-011, US-012                                          |

## Historia

Como **socio migrado**, quiero **activar mi cuenta digital usando mi DNI y definir mi correo y contraseña**, para **poder iniciar sesión y acceder a la plataforma de Activa Club**.

## Contrato de API

`POST /activation/verify` y `POST /activation/complete` (ambos públicos), según `docs/api/contratos-api.md` §3.

## Reglas de negocio

RN-ACT-01 (activación con DNI), RN-ACT-02 (el DNI valida identidad), RN-ACT-03 (un DNI, una cuenta digital), RN-ACT-04 (login con correo y contraseña).

## Valor de negocio

La activación convierte a un socio existente del sistema legado en un usuario digital operable. Es el camino de entrada principal del MVP para la base de socios ya migrada, garantizando la unicidad "un DNI, una cuenta".

## Precondiciones

- El socio existe en DynamoDB como resultado de la migración (US-012) con `memberStatus=MIGRATED` y sin `cognitoSub`.

## Postcondiciones

- Se crea el usuario en Cognito (grupo `member`), se enlaza `cognitoSub` al socio y `memberStatus` transiciona (`MIGRATED → ACTIVE` si la membresía está vigente; conserva `membershipStatus` `DEBT`/`EXPIRED` si corresponde).

## Criterios de aceptación

1. Al enviar un DNI en `POST /activation/verify`, si existe un socio migrado sin cuenta, la respuesta indica elegibilidad y devuelve datos mínimos (nombre, correo enmascarado) para confirmar identidad.
2. Si el DNI no corresponde a ningún socio migrado, se devuelve 404 `DNI_NOT_FOUND` y la interfaz muestra un mensaje claro que sugiere el registro como socio nuevo.
3. Si el socio ya activó su cuenta, se devuelve 409 `ALREADY_ACTIVATED` y la interfaz sugiere iniciar sesión o recuperar contraseña.
4. `POST /activation/complete` con DNI elegible, correo y contraseña válidos crea el usuario Cognito, enlaza `cognitoSub` y transiciona el estado del socio; la respuesta 201 devuelve `memberStatus` y `membershipStatus`.
5. Un correo ya usado por otra cuenta devuelve 409 `EMAIL_ALREADY_USED`; datos inválidos devuelven 400 `VALIDATION_ERROR`, mostrados campo a campo en el formulario.
6. La contraseña nunca se almacena en DynamoDB; la gestiona Cognito.
7. La unicidad de DNI y correo se valida en el backend, no solo en el frontend.
8. Tras una activación exitosa, el socio puede iniciar sesión (US-014) con el correo y contraseña definidos.
9. El formulario es responsive y accesible, con estados de carga y error.

## Casos alternativos / excepciones

- El socio abandona tras `verify` sin completar: no se crea usuario Cognito ni se modifica el estado.
- Reintento de `complete` con el mismo DNI ya activado: 409 `ALREADY_ACTIVATED`, sin efectos secundarios.
- Membresía migrada vencida o con deuda: la activación se completa, pero el socio queda con `membershipStatus` `EXPIRED`/`DEBT` (podrá iniciar sesión, no reservar; el pago pertenece a EP-03).

## Sugerencia de pruebas funcionales

- DNI elegible → verify OK → complete OK → login OK.
- DNI inexistente → `DNI_NOT_FOUND`.
- DNI ya activado → `ALREADY_ACTIVATED`.
- Correo duplicado en complete → `EMAIL_ALREADY_USED`.
- Contraseña débil / correo inválido → `VALIDATION_ERROR`.

## Trazabilidad

- Épica: EP-02
- Depende de: US-011 (endpoints), US-012 (socios migrados).
- Habilita: US-014 (login con cuentas activadas).
