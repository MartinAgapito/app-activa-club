# US-018 — Consultar y actualizar el perfil de usuario

| Campo               | Valor                                                   |
| ------------------- | ------------------------------------------------------- |
| ID                  | US-018                                                  |
| Épica               | [EP-02](../epicas/EP-02-migracion-activacion-acceso.md) |
| Tipo                | Historia de usuario                                     |
| Responsable         | Backend + Frontend                                      |
| Fase                | MVP                                                     |
| Sprint              | Sprint 1                                                |
| Prioridad           | Media                                                   |
| Estimación relativa | 5                                                       |
| Dependencias        | US-011                                                  |

## Historia

Como **socio autenticado**, quiero **consultar mi perfil y actualizar mis datos de contacto**, para **mantener mi información al día y ver el estado de mi cuenta**.

## Contrato de API

`GET /members/me` y `PATCH /members/me` (rol `member`), según `docs/api/contratos-api.md` §4.

## Reglas de negocio

RN-ADM-03 (referencia: los estados de membresía y deuda son consultables); la actualización se limita a datos propios editables (p. ej. teléfono). El DNI y el correo de identidad no se editan libremente por su rol en la unicidad (RN-ACT-02/03).

## Valor de negocio

El perfil da al socio visibilidad y control sobre sus datos, y es la base sobre la que el Home/dashboard mostrará su estado de membresía en épicas posteriores.

## Precondiciones

- El usuario tiene una sesión válida como `member`.

## Postcondiciones

- Los datos editables del socio quedan actualizados en DynamoDB.

## Criterios de aceptación

1. `GET /members/me` devuelve el perfil propio del socio autenticado, incluyendo su estado de socio y de membresía en modo lectura.
2. `PATCH /members/me` permite actualizar los datos de contacto editables (p. ej. teléfono) y devuelve el perfil actualizado.
3. Los intentos de modificar campos no editables (DNI, correo de identidad, estados) se rechazan o se ignoran de forma controlada, sin romper la unicidad.
4. Datos inválidos devuelven 400 `VALIDATION_ERROR`, mostrados campo a campo.
5. Sin sesión válida, `GET`/`PATCH /members/me` devuelven 401 `UNAUTHENTICATED`; un socio solo puede ver y editar su propio perfil.
6. La autorización y la validación de campos editables se aplican en el backend, no solo en el frontend.
7. La vista de perfil es responsive, accesible y con estados de carga y error.

## Casos alternativos / excepciones

- Socio con estado `MIGRATED`/`PENDING`: puede ver su perfil aunque aún no pueda operar todas las funciones.
- Actualización sin cambios reales: la operación es idempotente y no produce efectos adversos.

## Sugerencia de pruebas funcionales

- Socio autenticado consulta su perfil → datos correctos.
- Actualiza teléfono válido → persistido y reflejado.
- Intenta editar un campo no editable → rechazado/ignorado sin romper unicidad.
- Teléfono inválido → `VALIDATION_ERROR`.
- Sin sesión → `UNAUTHENTICATED`.

## Trazabilidad

- Épica: EP-02
- Depende de: US-011 (endpoints); requiere una cuenta autenticada de US-013 o US-016 para verificación extremo a extremo.
- Habilita: el Home/dashboard del socio (EP-07).
