# US-031 — Agregar otros socios e invitados externos a una reserva

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-031                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Backend                                            |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Alta                                               |
| Estimación relativa | 5                                                  |
| Dependencias        | US-030                                             |

## Historia

Como **socio titular**, quiero **agregar a otros socios y a invitados externos a mi reserva**, para **usar la instalación acompañado, sabiendo que el club controla el aforo y la frecuencia de los invitados**.

## Contrato de API

`POST /reservations` (member), campo `participants[]`, según `docs/api/contratos-api.md` §7. Cada participante es `{ "type": "MEMBER", "memberId": "..." }` o `{ "type": "GUEST", "dni": "...", "firstName": "...", "lastName": "..." }`. Esquema versionado: `reservationParticipantInputSchema` en `packages/validation`. Errores del contrato: 409 `PARTICIPANT_OVERLAP`, 429 `GUEST_MONTHLY_LIMIT`, 422 `CAPACITY_EXCEEDED`.

Dos endpoints de resolución por DNI acompañan a esta historia (contrato §4 y §7, [ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md)):

- `GET /members/lookup?dni=` (member, admin) → `{ memberId, firstName, lastName }`; 404 `DNI_NOT_FOUND` si no hay socio resoluble con ese DNI.
- `GET /guests/lookup?dni=` (member, admin) → `{ guestDni, firstName, lastName }`; 404 `NOT_FOUND` si ese invitado todavía no existe (señal para pedir nombre y apellido, no error de negocio).

Ambos devuelven **solo nombre y apellido** además del identificador: nunca correo, teléfono, DNI, estado de membresía ni el contador mensual del invitado.

## Reglas de negocio

RN-RES-03 (se pueden agregar otros socios e invitados), RN-RES-04 (los invitados externos pueden asistir a todos los espacios, incluida la piscina), RN-RES-05 (máximo dos visitas al mes por invitado externo), RN-RES-06 (el titular es responsable de sus participantes), RN-RES-08 (nadie puede estar en dos reservas superpuestas), RN-RES-09 (aforo). Modelo de datos: [§3.9 `ReservationParticipant`](../../data/modelo-dynamodb.md) (índice `SUBJECT#` en GSI1), [§3.10 `GuestMonthlyCounter`](../../data/modelo-dynamodb.md) y [§3.15 `GuestProfile`](../../data/modelo-dynamodb.md) (perfil reutilizable del invitado externo).

## Valor de negocio

Un club deportivo se usa acompañado: sin participantes, la reserva es un formulario incompleto. A la vez, es la regla que protege al club de que el acceso de invitados externos se convierta en una membresía gratuita encubierta (dos visitas por mes) y de que una misma persona figure en dos lugares a la vez.

## Precondiciones

- La creación de reserva con sus validaciones base ya funciona (US-030).
- El socio titular tiene sesión iniciada, está `ACTIVE` y sin deuda.
- Los socios participantes existen como socios del club.

## Postcondiciones

- Existe un ítem `ReservationParticipant` por cada participante, incluido el `HOLDER`, con su `subjectKey` (`MEMBER#<memberId>` o `GUEST#<guestDni>`) y la ventana `startsAt`/`endsAt` copiada de la reserva.
- Cada invitado externo tiene su `GuestProfile` (`PK=GUEST#<dni>`, `SK=PROFILE`) con nombre y apellido, creado en esta misma transacción si no existía.
- El contador mensual de cada invitado externo (`GuestMonthlyCounter` del mes en curso, zona `America/Lima`) queda incrementado y con la reserva registrada en `reservationIds`.
- Si cualquier participante viola una regla, **no** se crea la reserva ni se incrementa ningún contador.

## Reglas de resolución (funcionales)

- El titular cuenta siempre como participante (`HOLDER`) y ocupa un lugar del aforo.
- `guestCount` cuenta solo participantes de tipo `GUEST`; `participantCount` cuenta el total incluido el titular.
- La superposición se evalúa por **sujeto** (socio o invitado), no por reserva: la misma persona no puede estar en dos reservas activas cuyas ventanas se crucen, aunque sean de recursos distintos (RN-RES-08).
- El mes del contador de invitado se calcula en zona `America/Lima` (modelo de datos §2), no en UTC.
- El límite de dos visitas es **por invitado externo y por mes calendario**, sin importar el recurso ni quién lo invitó (RN-RES-05).
- El titular identifica a un socio participante **por DNI** (`GET /members/lookup`), nunca escribiendo un `memberId` a mano. Son resolubles los socios `MIGRATED`, `APPROVED` y `ACTIVE`; un `PENDING` o `REJECTED` responde el mismo 404 `DNI_NOT_FOUND` que un DNI inexistente (RN-ACT-06/07). La exigencia de estar activo y sin deuda (RN-RES-12) sigue aplicando solo al titular.
- El invitado externo se identifica también **por DNI** (`GET /guests/lookup`). Su alta es implícita: viaja con `dni`, `firstName` y `lastName` dentro de `POST /reservations` y el servidor hace un _upsert_ idempotente del `GuestProfile` en la misma transacción. **Gana el primer registro**: si el DNI ya tenía perfil, se conserva el nombre existente y el enviado se descarta sin error.

## Criterios de aceptación

1. Una reserva creada con participantes de tipo `MEMBER` y `GUEST` persiste un `ReservationParticipant` por cada uno más el `HOLDER`, y devuelve `participantCount` y `guestCount` coherentes con lo enviado.
2. Un participante de tipo `MEMBER` que ya figura en otra reserva activa con horario superpuesto provoca 409 `PARTICIPANT_OVERLAP` y la reserva **no** se crea (RN-RES-08).
3. El propio titular recibe el mismo trato: si ya tiene una reserva activa superpuesta (como titular o como participante de otro socio), su nueva reserva se rechaza con 409 `PARTICIPANT_OVERLAP`.
4. Un invitado externo (por su DNI) que ya figura en otra reserva activa superpuesta provoca 409 `PARTICIPANT_OVERLAP` (RN-RES-08).
5. Un invitado externo que ya registró dos visitas en el mes calendario en curso provoca 429 `GUEST_MONTHLY_LIMIT` y la reserva **no** se crea (RN-RES-05).
6. El contador mensual del invitado se incrementa **de forma atómica y condicionada** (`visitCount < 2`): dos reservas concurrentes que incluyan al mismo invitado en su segunda y tercera visita del mes no pueden dejar el contador en 3.
7. Los invitados externos se aceptan en **todos** los tipos de recurso, incluida la piscina (RN-RES-04).
8. El total de participantes, incluido el titular, no puede superar el `capacity` del recurso: 422 `CAPACITY_EXCEEDED` (RN-RES-09). En piscina, esto equivale a titular + 4 invitados.
9. Un participante repetido dentro de la misma reserva (mismo `memberId` o mismo DNI dos veces) se rechaza con 400 `VALIDATION_ERROR`.
10. Un participante de tipo `MEMBER` que no corresponde a ningún socio resoluble del club se rechaza con 404 `NOT_FOUND`, sin crear la reserva.
11. La reserva, sus participantes y los contadores de invitado se escriben en una **sola operación atómica**: si cualquier condición falla, no queda ningún efecto parcial.
12. La reserva registra explícitamente al titular como responsable de todos los participantes (RN-RES-06), y ese dato es visible en el detalle de la reserva (US-033) y en la consola administrativa (US-036).
13. Ningún dato de un socio participante distinto del titular se expone más allá de lo estrictamente necesario para identificarlo en la reserva (nombre y apellido); no se devuelven correo, teléfono, DNI completo ni estado de membresía de terceros.
14. `GET /members/lookup?dni=` con rol `member` devuelve exactamente `memberId`, `firstName` y `lastName` de un socio resoluble, y **ningún** campo más; un DNI sin socio, o de un socio `PENDING`/`REJECTED`, devuelve 404 `DNI_NOT_FOUND`; un DNI con formato inválido, 400 `VALIDATION_ERROR`; sin token, 401.
15. `GET /guests/lookup?dni=` devuelve `guestDni`, `firstName` y `lastName` de un invitado ya registrado, y 404 `NOT_FOUND` si nunca fue invitado. Nunca devuelve su contador mensual de visitas ni ningún otro dato.
16. Un invitado externo nuevo se crea con nombre y apellido en el mismo `POST /reservations`, sin endpoint de alta previo: al confirmarse la reserva existe su `GuestProfile` y la siguiente vez `GET /guests/lookup` lo encuentra.
17. Si dos socios envían el mismo DNI de invitado con nombres distintos, el perfil conserva el nombre del primer registro, la segunda reserva se crea igual (no es un conflicto) y el `guestName` guardado en sus `ReservationParticipant` es el del perfil, no el texto enviado.
18. El `GuestProfile` se escribe dentro de la misma transacción que la reserva: si la reserva se rechaza por cualquier regla, no queda ningún perfil de invitado creado.

## Casos alternativos / excepciones

- **Invitado externo en su segunda visita del mes**: se acepta; la tercera del mismo mes se rechaza. Al cambiar de mes calendario el cupo se renueva.
- **Cancelación de una reserva con invitados**: devuelve el cupo consumido (US-033), de modo que el invitado puede volver a ser invitado ese mismo mes.
- **Rechazo administrativo de una reserva pendiente con invitados**: devuelve igualmente el cupo (US-034); un invitado no debe perder su visita por una decisión que el club nunca aprobó.
- **Socio participante con deuda o vencido**: en el MVP la restricción de RN-RES-12 aplica al **titular**, que es el responsable (RN-RES-06); no se bloquea a un socio participante por su estado de membresía. Si el club quisiera exigirlo también a los participantes, sería un cambio de regla que requiere aprobación del product owner y actualización del Contexto Maestro.
- **Reserva sin participantes**: válida, con `participantCount=1` y `guestCount=0` (US-030).
- **Nombre de invitado mal escrito la primera vez**: en el MVP no hay forma de corregirlo (no existe endpoint de edición de invitados). Queda registrado como limitación conocida; corregirlo sería una capacidad administrativa posterior, nunca una escritura del rol `member` sobre datos de un tercero.
- **Invitado que además es socio del club**: se lo agrega como `MEMBER` (por su DNI en `GET /members/lookup`), no como `GUEST`; un socio no consume cupo de invitado.

## Sugerencia de pruebas funcionales

- R-05: un socio no puede estar en dos reservas superpuestas (como titular y como participante).
- R-06: un invitado externo no puede estar en dos reservas superpuestas.
- R-07: tercera visita del mismo invitado en el mes → 429 `GUEST_MONTHLY_LIMIT`.
- R-08: invitado externo en piscina → aceptado.
- R-24: reserva con otros socios e invitados a la vez → persistida correctamente.
- R-04 (borde): titular + participantes justo en el aforo → aceptada; uno más → `CAPACITY_EXCEEDED`.
- Concurrencia: dos reservas simultáneas con el mismo invitado en su segunda visita → solo una prospera.
- Cambio de mes: invitado con 2 visitas en el mes anterior puede volver a ser invitado el mes siguiente.
- Privacidad (nuevo): la respuesta de `GET /members/lookup` y `GET /guests/lookup` contiene exactamente los campos documentados y ninguno más; socio `PENDING` → 404 igual que un DNI inexistente.
- Reutilización de invitado: crear una reserva con un invitado nuevo, luego `GET /guests/lookup` con ese DNI → lo encuentra con el nombre registrado.
- Nombre divergente: segunda reserva con el mismo DNI y otro nombre → la reserva se crea y el nombre almacenado no cambia.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-03/04/05/06/08/09.
- Casos de prueba: R-04 (borde), R-05, R-06, R-07, R-08, R-24.
- Depende de: US-030.
- Habilita: US-032 (selección de participantes en la interfaz), US-033 (devolución de cupo al cancelar).

## Decisión de identificación de participantes (decisión 1 de EP-04, cerrada)

Resuelta antes del Sprint Planning y registrada en [ADR-0009](../../architecture/adr/ADR-0009-identificacion-participantes-por-dni.md) y en `docs/api/contratos-api.md` (§4 y §7): la identificación se hace **por DNI exacto** con dos endpoints propios de resolución (`GET /members/lookup`, `GET /guests/lookup`) que devuelven solo identificador + nombre y apellido, y el invitado externo pasa a tener un **perfil persistente** (`GuestProfile`, modelo §3.15) creado por _upsert_ idempotente dentro de la transacción de la reserva.

Se descartaron: sobrecargar `GET /members` con un querystring `dni` y una forma de respuesta distinta por rol (un fallo en la comprobación de rol expondría el padrón completo), abrir un buscador de socios al rol `member`, invitar por correo (depende de EP-05 y expone el correo de un tercero) y un endpoint explícito `POST /guests` (más pasos y estados inconsistentes).

Con esto US-031 cumple la Definition of Ready completa: ya no queda ninguna parte bloqueada. Impacto en el sprint: dos endpoints más para US-027 y un cambio en el esquema `reservationParticipantInputSchema` (`name` → `firstName` + `lastName`), sin consumidores todavía.
