# US-032 — Reservar una instalación desde la plataforma

| Campo               | Valor                                              |
| ------------------- | -------------------------------------------------- |
| ID                  | US-032                                             |
| Épica               | [EP-04](../epicas/EP-04-reservas-instalaciones.md) |
| Tipo                | Historia de usuario                                |
| Responsable         | Frontend                                           |
| Fase                | MVP                                                |
| Sprint              | Sprint 3                                           |
| Prioridad           | Crítica                                            |
| Estimación relativa | 5                                                  |
| Dependencias        | US-029, US-030, US-031                             |

## Historia

Como **socio**, quiero **elegir instalación, día, horario y acompañantes en una pantalla clara y confirmar mi reserva**, para **reservar en pocos pasos y entender de inmediato si algo salió mal y por qué**.

> Esta historia entrega la **experiencia de reserva**. Toda regla crítica la valida el servidor (US-030 y US-031); la interfaz la anticipa para evitar errores, nunca la reemplaza.

## Contrato de API

Consume `GET /resources`, `GET /resources/{resourceId}/availability?date=`, `GET /members/lookup?dni=`, `GET /guests/lookup?dni=` y `POST /reservations` (`docs/api/contratos-api.md` §4, §6 y §7). Los mensajes de error se derivan del `error.code` del contrato (§1.1 y §1.3).

## Reglas de negocio

RN-RES-01..12 (visibles para el socio en forma de opciones y mensajes), RN-PAG-06 (el socio con deuda no puede reservar y debe poder llegar al pago). Fundación de diseño y rutas: [US-008](./US-008-mapa-rutas-design-foundation.md).

## Valor de negocio

Es la pantalla por la que el socio percibe el valor de todo lo construido en los tres sprints anteriores. También es donde se evita la mayor parte del soporte: una reserva que falla sin explicación genera desconfianza; una que explica "esa franja ya está tomada" o "tu invitado ya usó sus dos visitas del mes" se resuelve sola.

## Precondiciones

- El socio tiene sesión iniciada y accede al área protegida por `RequireActiveMember` (EP-02).
- Los endpoints de catálogo, disponibilidad y creación de reserva están integrados en `dev`.

## Postcondiciones

- Si la reserva se crea, el socio ve la confirmación con el estado real devuelto por el servidor y puede llegar a su lista de reservas (US-033).
- Si la reserva falla, el socio permanece en el flujo con sus datos conservados y un mensaje accionable.

## Criterios de aceptación

1. El socio puede ver las instalaciones del club agrupadas o identificadas por tipo (fútbol, tenis, pádel, piscina, parrillas, salón social) con su aforo y duración de reserva, tomados de `GET /resources`.
2. Al elegir una instalación y una fecha, el socio ve las franjas del día distinguiendo libre, ocupada por otra reserva y **en mantenimiento** (campo `status` de cada franja, US-029), y puede cambiar de fecha sin perder la instalación seleccionada.
3. Solo se pueden seleccionar franjas con `available=true`; las demás se muestran deshabilitadas y no clicables, con el motivo visible (ocupada, en mantenimiento, ya pasada).
4. El socio agrega participantes **buscando por DNI**, y puede quitarlos antes de confirmar:
   - **Otro socio**: busca con `GET /members/lookup?dni=`, ve el nombre devuelto para confirmar a quién agrega y la interfaz usa el `memberId` recibido (el socio nunca escribe un identificador interno). Si el DNI no resuelve (404 `DNI_NOT_FOUND`), se le indica que esa persona no figura como socio y puede agregarla como invitado externo.
   - **Invitado externo**: busca con `GET /guests/lookup?dni=`; si existe, se precarga su nombre y apellido; si devuelve 404, la interfaz pide nombre y apellido y los envía en `POST /reservations` (el alta es implícita, US-031). Si el invitado ya existía, la interfaz no permite renombrarlo: muestra el nombre registrado.
5. La interfaz impide superar el aforo del recurso al agregar participantes y explica el límite (por ejemplo, "piscina: titular más 4 invitados").
6. La interfaz informa antes de confirmar si la instalación elegida **requiere aprobación administrativa** (parrillas y salón social), para que el socio no espere una confirmación inmediata.
7. Al confirmar, la interfaz muestra el resultado real del servidor: `CONFIRMED` con mensaje de reserva confirmada, o `PENDING_APPROVAL` con mensaje de solicitud enviada a revisión.
8. Cada error del contrato se traduce a un mensaje comprensible y accionable, sin exponer detalles internos: `RESERVATION_OVERLAP`, `PARTICIPANT_OVERLAP`, `CAPACITY_EXCEEDED`, `GUEST_MONTHLY_LIMIT`, `OUTSIDE_SCHEDULE`, `RESOURCE_IN_MAINTENANCE`, `MEMBER_HAS_DEBT`, `MEMBERSHIP_REQUIRED`, `VALIDATION_ERROR`.
9. Ante `RESERVATION_OVERLAP` o `RESOURCE_IN_MAINTENANCE`, la interfaz refresca la disponibilidad del día y mantiene el resto de los datos ya cargados (instalación, participantes).
10. Un socio con deuda o membresía vencida ve un aviso claro de que no puede reservar y un acceso directo al pago de su membresía (EP-03), en lugar de un error críptico al confirmar.
11. El botón de confirmar se deshabilita mientras la petición está en curso, de modo que un doble clic no genere dos reservas.
12. Los estados de carga, error y vacío están cubiertos: catálogo cargando, día sin franjas libres, fallo de red al confirmar.
13. El flujo es usable en viewport móvil y de escritorio, con etiquetas de formulario asociadas, foco visible y navegación por teclado.
14. La interfaz **no** decide ninguna regla por su cuenta: si el servidor rechaza algo que la pantalla creía válido, gana el servidor y se muestra su mensaje.

## Casos alternativos / excepciones

- **Socio con deuda que llega por enlace directo al flujo de reserva**: ve el aviso de bloqueo y el acceso al pago; si igualmente confirma, el servidor responde `MEMBER_HAS_DEBT` y la interfaz lo muestra sin ambigüedad.
- **Franja tomada mientras el socio completaba participantes**: mensaje específico de franja ya ocupada más refresco de disponibilidad.
- **Invitado que agotó sus visitas del mes**: el mensaje identifica al invitado afectado, no un error genérico. La interfaz no puede anticiparlo: el cupo restante de un invitado no se expone por API (privacidad, US-031), así que el aviso llega del servidor al confirmar.
- **DNI buscado que no existe ni como socio ni como invitado**: no es un error; la interfaz ofrece darlo de alta como invitado externo pidiendo nombre y apellido.
- **Sesión expirada al confirmar**: la interfaz lleva al login y, tras autenticarse, devuelve al socio al flujo de reserva.
- **Fallo de red sin respuesta del servidor**: la interfaz ofrece reintentar y advierte que la reserva podría haberse creado; el socio puede verificarlo en su lista de reservas (US-033).

## Sugerencia de pruebas funcionales

- R-01 (E2E): socio activo reserva una cancha de fútbol libre → confirmación inmediata visible.
- R-11 (E2E): socio solicita una parrilla → pantalla de solicitud pendiente de aprobación.
- R-19 / P-10 (E2E): socio con deuda intenta reservar → aviso de bloqueo y acceso al pago.
- R-03 (IC): respuesta `RESERVATION_OVERLAP` → mensaje correcto y disponibilidad refrescada.
- R-07 (IC): respuesta `GUEST_MONTHLY_LIMIT` → mensaje que identifica al invitado.
- T-01: flujo de reserva en viewport móvil y escritorio.
- T-03: estados de carga, error y vacío.
- T-05: los mensajes usan el `code`/`message` del contrato sin filtrar detalles internos.
- Doble clic en confirmar → una sola reserva creada.

## Trazabilidad

- Épica: EP-04
- Reglas: RN-RES-01..12 (representación en interfaz), RN-PAG-06.
- Casos de prueba: R-01, R-03, R-07, R-11, R-19; T-01, T-03, T-05.
- Depende de: US-029, US-030, US-031.
- Habilita: la demo extremo a extremo del Sprint 3 y el caso A-15 completo (registro → aprobación → pago → reserva).
