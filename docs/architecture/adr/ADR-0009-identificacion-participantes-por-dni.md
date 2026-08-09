# ADR-0009 — Identificación de participantes por DNI y perfil persistente de invitado

- **Estado**: Aceptado
- **Fecha**: 2026-08-09
- **Decisores**: Arquitecto
- **Historia relacionada**: US-031 (y US-032 en la interfaz); decisión pendiente 1 de
  [EP-04](../../scrum/epicas/EP-04-reservas-instalaciones.md)

## Contexto

`POST /reservations` exige `memberId` para un participante de tipo `MEMBER` y
`dni` + nombre para un participante de tipo `GUEST` (contrato §7, RN-RES-03/04).
Dos huecos impedían implementar esa regla tal como estaba:

1. **Ningún endpoint accesible al rol `member` devuelve el `memberId` de otro
   socio.** `GET /members` es un listado paginado por `memberStatus`, exclusivo
   de `admin`. El socio titular conoce el DNI de su acompañante, no su ULID
   interno, así que RN-RES-03 no era usable desde la interfaz.
2. **El nombre de un invitado externo no persiste.** El modelo solo tenía
   `GuestMonthlyCounter` (`PK=GUEST#<dni>` / `SK=MONTH#<yyyy-mm>`), que cuenta
   visitas pero no guarda quién es el invitado. Cada reserva obligaba a
   retipear el nombre, con el riesgo de que el mismo DNI apareciera con
   nombres distintos en reservas distintas.

Restricciones que condicionan la solución:

- **Privacidad de terceros** (criterio 13 de US-031 y riesgo "fuga de datos
  personales" del Sprint 3): al identificar a un participante no puede
  exponerse correo, teléfono, DNI completo, estado de membresía ni saldo de
  ningún socio ajeno.
- **No inventar contratos**: cualquier mecanismo debe quedar documentado en
  `docs/api/contratos-api.md` y en el modelo de datos antes de implementarse.
- **Alcance MVP**: el club tiene pocos usuarios y la funcionalidad debe caber
  en el Sprint 3 sin ampliar el alcance de EP-04.

## Decisión

### 1. Dos endpoints de resolución exacta por DNI, separados de los listados

Se agregan **dos endpoints nuevos de solo lectura**, ambos con autorización
`member|admin`:

| Endpoint                   | Devuelve                            | Si no existe        |
| -------------------------- | ----------------------------------- | ------------------- |
| `GET /members/lookup?dni=` | `memberId`, `firstName`, `lastName` | 404 `DNI_NOT_FOUND` |
| `GET /guests/lookup?dni=`  | `guestDni`, `firstName`, `lastName` | 404 `NOT_FOUND`     |

Características comunes, que son la razón de ser de la decisión:

- **Coincidencia exacta de DNI** (8 dígitos, mismo `dniSchema` ya versionado).
  No hay búsqueda por prefijo, por nombre ni listado: no es un buscador de
  socios, es una resolución puntual de identidad.
- **Respuesta mínima**: solo el identificador necesario para armar la reserva y
  el nombre para que el titular confirme visualmente a quién está agregando.
  Nunca correo, teléfono, DNI completo, `memberStatus`, `membershipStatus`,
  `outstandingBalance` ni el contador mensual del invitado.
- **Sin paginación ni cursor**: cero o un resultado.

`GET /members/lookup` resuelve únicamente socios con `memberStatus` en
`MIGRATED`, `APPROVED` o `ACTIVE`. Un `PENDING` (solicitud aún no aprobada) o un
`REJECTED` no son socios del club (RN-ACT-06/07) y se responden con el mismo
404 `DNI_NOT_FOUND` que un DNI inexistente: así el endpoint tampoco funciona
como oráculo del estado de una solicitud ajena. La restricción de RN-RES-12
(activo y sin deuda) **no** se aplica al participante, solo al titular, tal como
fijó el Sprint 3.

### 2. Endpoint nuevo en vez de `GET /members?dni=`

Se descarta reutilizar `GET /members` con un querystring `dni` y una forma de
respuesta distinta según el rol del llamador. Ver alternativas.

### 3. Entidad `GuestProfile` persistente, con alta implícita e idempotente

Se agrega la entidad **`GuestProfile`** como ítem hermano del contador mensual
bajo la misma partición del invitado (`PK=GUEST#<guestDni>`, `SK=PROFILE`),
siguiendo el mismo patrón que `Member` (`PK=MEMBER#<memberId>`, `SK=PROFILE`).
Guarda `firstName`, `lastName` y metadatos de creación; nada más.

El alta es **implícita dentro de `POST /reservations`**, no un endpoint aparte:
el participante `GUEST` viaja con `dni`, `firstName` y `lastName`, y el servidor
hace un _upsert_ idempotente dentro del mismo `TransactWriteItems` que crea la
reserva, con `if_not_exists` sobre cada campo de nombre. Consecuencias directas:

- **Gana el primer registro**: si dos socios escriben el mismo DNI con nombres
  distintos, el perfil conserva el nombre con el que se creó y el segundo envío
  se ignora en silencio (no es un 409: no debe bloquear una reserva legítima).
- El `guestName` que se guarda en `ReservationParticipant` es una **copia del
  perfil resuelto**, no del texto enviado en esa petición: todas las reservas
  del mismo DNI muestran el mismo nombre.
- No existe un estado intermedio "invitado creado pero sin reserva": si la
  transacción falla por cualquier regla (aforo, cupo mensual, solape), tampoco
  queda el perfil.

Para reflejar `firstName`/`lastName` de forma consistente con `Member`, el
participante `GUEST` de `POST /reservations` pasa de `name` (un solo campo) a
`firstName` + `lastName`. Es un cambio del esquema ya versionado en
`packages/validation`, sin consumidores todavía (EP-04 aún no está
implementado).

## Alternativas consideradas

- **`GET /members?dni=<dni>` con respuesta reducida cuando llama un `member`.**
  Rechazada. Un mismo endpoint con dos formas de respuesta y dos niveles de
  autorización según el rol es exactamente la clase de contrato que produce
  fugas: cualquier error en la comprobación de rol convierte un listado
  administrativo completo (DNI, correo, estado de membresía de todos los
  socios) en una respuesta accesible a un socio. Además obliga a que una sola
  Lambda tenga a la vez permiso de `Query` sobre GSI2 (listado por estado) y de
  lectura puntual, en contra del mínimo privilegio de ADR-0004. Separar el
  endpoint deja la superficie del rol `member` con **una** Lambda que solo sabe
  hacer `GetItem` por DNI y devolver tres campos.
- **Buscador de socios por nombre para el rol `member`.** Rechazada:
  exposición innecesaria de un padrón de socios, y no lo pide ninguna regla.
- **Invitar por correo electrónico al socio participante.** Rechazada para el
  MVP: obliga a conocer el correo de un tercero, agrega un flujo de aceptación
  (invitación pendiente/aceptada/rechazada) y depende del módulo de
  notificaciones (EP-05). Es la evolución natural si el club lo pide después.
- **Alta explícita de invitado (`POST /guests`) antes de reservar.**
  Rechazada: agrega un endpoint de escritura y un paso más al flujo, y permite
  estados inconsistentes (invitados creados que nunca se usan, perfiles creados
  por reservas que después fallan). El _upsert_ dentro de la transacción de
  reserva no tiene ninguno de los dos problemas.
- **Rechazar con 409 cuando el nombre enviado no coincide con el perfil
  existente.** Rechazada: convierte un error de tipeo ajeno en un bloqueo de
  reserva que el socio no puede resolver por sí mismo.
- **Guardar el nombre del invitado solo en `ReservationParticipant`** (sin
  perfil). Rechazada: es el estado actual y es justamente lo que impide
  reutilizar al invitado sin retipear; recuperar el último nombre usado
  exigiría escanear participantes por sujeto, un patrón de acceso más caro y
  sin garantía de unicidad de nombre.

## Consecuencias

- **Positivas**: RN-RES-03/04 pasan a ser implementables desde la interfaz; la
  superficie de datos personales expuesta al rol `member` queda reducida a
  nombre y apellido de una persona concreta cuyo DNI el socio ya conocía; el
  invitado recurrente no se retipea; el nombre del invitado es único por DNI.
- **Negativas**: dos endpoints más que provisionar (US-027 pasa de once a trece)
  y un cambio en un esquema ya versionado (`participants[].name` →
  `firstName`/`lastName`).
- **Riesgo y mitigación**: un socio puede sondear DNIs para averiguar si una
  persona es socia del club y con qué nombre figura. Mitigaciones: coincidencia
  exacta (no hay enumeración por prefijo), respuesta de tres campos, misma
  respuesta 404 para "no existe" y "no es socio", endpoint autenticado (nunca
  público) y _throttling_ por método en API Gateway (US-027), con
  `RATE_LIMITED` ya previsto en el contrato. Se acepta el riesgo residual: el
  dato expuesto es equivalente a preguntar en recepción si alguien es socio.
- **Impacto**:
  - _Backend (US-031)_: dos Lambdas de lectura (`members-lookup`,
    `guests-lookup`) y el _upsert_ de `GuestProfile` dentro del
    `TransactWriteItems` de creación de reserva.
  - _Frontend (US-032)_: el formulario de participantes busca por DNI, muestra
    el nombre para confirmar y solo pide nombre y apellido cuando el invitado
    no existe todavía.
  - _Terraform (US-027)_: dos endpoints más, ambos `member|admin`, con permiso
    de `GetItem` sobre la tabla y **sin** acceso a ningún GSI.
  - _QA_: casos de privacidad (la respuesta no trae campos de más), de DNI
    inexistente, de socio `PENDING`/`REJECTED`, y de nombre divergente para el
    mismo DNI de invitado.
  - _CI/CD_: sin cambios en el pipeline.
