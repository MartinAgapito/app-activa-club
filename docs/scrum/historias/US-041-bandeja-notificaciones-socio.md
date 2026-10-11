# US-041 — Consultar mi bandeja de notificaciones y marcarlas como leídas

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-041                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend + Frontend                         |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 5                                          |
| Dependencias        | US-039, US-040                             |

## Historia

Como **socio**, quiero **ver en la plataforma los avisos que el club me envió y marcarlos como leídos**, para **enterarme de lo que pasa con mi cuenta, mis pagos y mis reservas sin depender del correo**.

## Contrato de API

`GET /notifications` y `POST /notifications/{notificationId}/read` (member), según `docs/api/contratos-api.md` §8. Paginación por cursor `{ items, nextCursor }` (§1). Pantalla existente como placeholder: `/socio/notificaciones` (`NotificationsPage`).

## Reglas de negocio

RN-NOT-01 (la bandeja interna es obligatoria). Modelo de datos: patrón de acceso 5 (`Query` PK=`MEMBER#<id>`, `begins_with(SK,"NOTIF#")`).

## Valor de negocio

La bandeja es el canal que el club **siempre** puede garantizar: el correo es complementario y en el sandbox de SES ni siquiera llega a todos. Sin esta pantalla, los avisos de EP-05 existen en la base de datos pero ningún socio los ve.

## Precondiciones

- El socio tiene sesión iniciada con rol `member` y `memberStatus=ACTIVE` (la ruta está protegida por `RequireActiveMember`).

## Postcondiciones

- Al marcar una notificación como leída queda `readStatus=READ` con su `readAt`.

## Criterios de aceptación

1. `GET /notifications` devuelve solo las notificaciones del socio autenticado, de la más reciente a la más antigua, paginadas por cursor.
2. Cada elemento incluye título, cuerpo, evento (si es automática), estado de lectura y fecha.
3. `POST /notifications/{notificationId}/read` sobre una notificación propia la deja `READ` y registra `readAt`; repetir la llamada sobre una ya leída responde éxito sin cambiar `readAt` (idempotente).
4. `POST /notifications/{notificationId}/read` sobre una notificación de otro socio o inexistente responde 404 `NOT_FOUND`, sin revelar si existe.
5. La identidad sale siempre del token: no hay forma de leer ni marcar la bandeja de otro socio pasando un identificador.
6. En `/socio/notificaciones` el socio ve su bandeja con las no leídas destacadas visualmente y la fecha en hora de Lima.
7. Abrir una notificación muestra su contenido completo y la marca como leída; el cambio se refleja en la lista sin recargar la página.
8. La pantalla tiene estados de carga, error, vacío ("todavía no tienes notificaciones") y paginación operable por teclado; es responsive.
9. Las notificaciones de eventos de reserva o pago muestran un acceso a la sección relacionada (Mis reservas, Membresía), sin exponer identificadores internos en el texto.

## Casos alternativos / excepciones

- **Socio `APPROVED` o `REJECTED`**: no entra al área de socio, así que no ve la bandeja; los avisos `MEMBER_APPROVED`/`MEMBER_REJECTED` le llegan por correo (ver US-042).
- **Marcar todas como leídas** y **eliminar notificaciones**: no están en el contrato ni en el Contexto Maestro; fuera de esta historia.
- **Contador de no leídas en el menú**: el contrato no devuelve un contador; ver pregunta abierta 6 de EP-05. Esta historia no lo exige.

## Sugerencia de pruebas funcionales

- N-01: el socio ve su bandeja y solo la suya.
- N-02: marcar como leída cambia `UNREAD → READ`; segunda llamada idempotente.
- Marcar una notificación ajena → 404.
- Estado vacío y paginación con `nextCursor`.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-01.
- Casos de prueba: N-01, N-02.
- Depende de: US-039 (endpoints), US-040 (notificaciones reales que mostrar).
- Habilita: US-055 (notificaciones recientes del dashboard del socio).
