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

`POST /reservations` (member), campo `participants[]`, según `docs/api/contratos-api.md` §7. Cada participante es `{ "type": "MEMBER", "memberId": "..." }` o `{ "type": "GUEST", "dni": "...", "name": "..." }`. Esquema ya versionado: `reservationParticipantInputSchema` en `packages/validation`. Errores del contrato: 409 `PARTICIPANT_OVERLAP`, 429 `GUEST_MONTHLY_LIMIT`, 422 `CAPACITY_EXCEEDED`.

## Reglas de negocio

RN-RES-03 (se pueden agregar otros socios e invitados), RN-RES-04 (los invitados externos pueden asistir a todos los espacios, incluida la piscina), RN-RES-05 (máximo dos visitas al mes por invitado externo), RN-RES-06 (el titular es responsable de sus participantes), RN-RES-08 (nadie puede estar en dos reservas superpuestas), RN-RES-09 (aforo). Modelo de datos: [§3.9 `ReservationParticipant`](../../data/modelo-dynamodb.md) (índice `SUBJECT#` en GSI1) y [§3.10 `GuestMonthlyCounter`](../../data/modelo-dynamodb.md).

## Valor de negocio

Un club deportivo se usa acompañado: sin participantes, la reserva es un formulario incompleto. A la vez, es la regla que protege al club de que el acceso de invitados externos se convierta en una membresía gratuita encubierta (dos visitas por mes) y de que una misma persona figure en dos lugares a la vez.

## Precondiciones

- La creación de reserva con sus validaciones base ya funciona (US-030).
- El socio titular tiene sesión iniciada, está `ACTIVE` y sin deuda.
- Los socios participantes existen como socios del club.

## Postcondiciones

- Existe un ítem `ReservationParticipant` por cada participante, incluido el `HOLDER`, con su `subjectKey` (`MEMBER#<memberId>` o `GUEST#<guestDni>`) y la ventana `startsAt`/`endsAt` copiada de la reserva.
- El contador mensual de cada invitado externo (`GuestMonthlyCounter` del mes en curso, zona `America/Lima`) queda incrementado y con la reserva registrada en `reservationIds`.
- Si cualquier participante viola una regla, **no** se crea la reserva ni se incrementa ningún contador.

## Reglas de resolución (funcionales)

- El titular cuenta siempre como participante (`HOLDER`) y ocupa un lugar del aforo.
- `guestCount` cuenta solo participantes de tipo `GUEST`; `participantCount` cuenta el total incluido el titular.
- La superposición se evalúa por **sujeto** (socio o invitado), no por reserva: la misma persona no puede estar en dos reservas activas cuyas ventanas se crucen, aunque sean de recursos distintos (RN-RES-08).
- El mes del contador de invitado se calcula en zona `America/Lima` (modelo de datos §2), no en UTC.
- El límite de dos visitas es **por invitado externo y por mes calendario**, sin importar el recurso ni quién lo invitó (RN-RES-05).

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
10. Un participante de tipo `MEMBER` que no corresponde a ningún socio del club se rechaza con 400 `VALIDATION_ERROR` o 404 `NOT_FOUND`, sin crear la reserva.
11. La reserva, sus participantes y los contadores de invitado se escriben en una **sola operación atómica**: si cualquier condición falla, no queda ningún efecto parcial.
12. La reserva registra explícitamente al titular como responsable de todos los participantes (RN-RES-06), y ese dato es visible en el detalle de la reserva (US-033) y en la consola administrativa (US-036).
13. Ningún dato de un socio participante distinto del titular se expone más allá de lo estrictamente necesario para identificarlo en la reserva (nombre y apellido); no se devuelven correo, teléfono, DNI completo ni estado de membresía de terceros.

## Casos alternativos / excepciones

- **Invitado externo en su segunda visita del mes**: se acepta; la tercera del mismo mes se rechaza. Al cambiar de mes calendario el cupo se renueva.
- **Cancelación de una reserva con invitados**: devuelve el cupo consumido (US-033), de modo que el invitado puede volver a ser invitado ese mismo mes.
- **Rechazo administrativo de una reserva pendiente con invitados**: devuelve igualmente el cupo (US-034); un invitado no debe perder su visita por una decisión que el club nunca aprobó.
- **Socio participante con deuda o vencido**: en el MVP la restricción de RN-RES-12 aplica al **titular**, que es el responsable (RN-RES-06); no se bloquea a un socio participante por su estado de membresía. Si el club quisiera exigirlo también a los participantes, sería un cambio de regla que requiere aprobación del product owner y actualización del Contexto Maestro.
- **Reserva sin participantes**: válida, con `participantCount=1` y `guestCount=0` (US-030).

## Sugerencia de pruebas funcionales

- R-05: un socio no puede estar en dos reservas superpuestas (como titular y como participante).
- R-06: un invitado externo no puede estar en dos reservas superpuestas.
- R-07: tercera visita del mismo invitado en el mes → 429 `GUEST_MONTHLY_LIMIT`.
- R-08: invitado externo en piscina → aceptado.
- R-24: reserva con otros socios e invitados a la vez → persistida correctamente.
- R-04 (borde): titular + participantes justo en el aforo → aceptada; uno más → `CAPACITY_EXCEEDED`.
- Concurrencia: dos reservas simultáneas con el mismo invitado en su segunda visita → solo una prospera.
- Cambio de mes: invitado con 2 visitas en el mes anterior puede volver a ser invitado el mes siguiente.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-03/04/05/06/08/09.
- Casos de prueba: R-04 (borde), R-05, R-06, R-07, R-08, R-24.
- Depende de: US-030.
- Habilita: US-032 (selección de participantes en la interfaz), US-033 (devolución de cupo al cancelar).

## Nota para el Sprint Planning (decisión pendiente 1 de EP-04)

El contrato y el esquema de validación ya versionados exigen `memberId` para un participante de tipo `MEMBER`, pero **ningún endpoint accesible al rol `member` permite obtener el `memberId` de otro socio**: `GET /members` es exclusivo de `admin`. Tal como está, RN-RES-03 no es usable desde la interfaz del socio. Propuesta del Product Analyst: resolver al socio participante por **DNI**, reutilizando el ítem de unicidad `UNIQ#DNI#` que ya existe, y devolver únicamente el dato mínimo para que el titular confirme a quién está agregando (nombre y `memberId`), con la misma restricción de privacidad del criterio 13. Cualquier alternativa (buscador de socios para el rol `member`, invitación por correo) debe decidirla el Arquitecto y quedar registrada en `docs/api/contratos-api.md` **antes** de implementar esta historia. Mientras la decisión no exista, US-031 no cumple la Definition of Ready para la parte de socios participantes; la parte de invitados externos sí puede avanzar.
