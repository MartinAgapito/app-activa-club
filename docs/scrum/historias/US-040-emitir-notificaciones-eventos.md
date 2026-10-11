# US-040 — Emitir notificaciones de eventos (bandeja interna y correo)

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-040                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Tarea técnica                              |
| Responsable         | Backend + DevOps                           |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Crítica                                    |
| Estimación relativa | 5                                          |
| Dependencias        | US-039                                     |

## Objetivo

Construir **una sola vez** la capacidad de emitir una notificación de evento automático a un socio: dejarla en su bandeja interna (obligatoria) y, además, enviarle el correo transaccional correspondiente de forma _best-effort_. Las historias US-042 a US-047 solo deciden **cuándo** y **a quién** notificar; ninguna reimplementa el **cómo**.

## Entregable

- Un módulo de backend reutilizable que, dado un socio, un evento del catálogo `NotificationEvent` y los datos del evento, registra la `Notification` (con `createdBy=SYSTEM`) y la `MemberNotification` del socio, y envía el correo.
- Un texto (título, cuerpo y correo) en español por cada uno de los trece eventos de `docs/data/diccionario-de-datos.md` (`NotificationEvent`), sin datos sensibles.
- Las plantillas de correo SES por evento, definidas en Terraform ([ADR-0006](../../architecture/adr/ADR-0006-ses-correos-transaccionales.md)).

## Reglas de negocio

RN-NOT-01 (bandeja interna obligatoria), RN-NOT-02 (correo transaccional), RN-NOT-04 (catálogo de eventos), RN-PAG-08 (sin datos de tarjeta). Modelo de datos §3.12 (`Notification`) y §3.13 (`MemberNotification`), entidades ya definidas y sin uso hasta ahora.

## Valor de negocio

Siete eventos de los Sprints 1 a 3 quedaron con "el rastro previsto" pero sin aviso real. Centralizar la emisión evita siete implementaciones distintas de lo mismo, garantiza que todos los avisos tengan el mismo formato y que un fallo de correo nunca rompa una operación del socio.

## Precondiciones

- US-039 desplegada: permisos de escritura y de `ses:SendEmail` disponibles.

## Postcondiciones

- Por cada evento emitido existe una `MemberNotification` `UNREAD` en la bandeja del socio y un registro `Notification` contabilizable en "notificaciones enviadas" (RN-ANL-08).

## Criterios de aceptación

1. Emitir un evento a un socio crea su `MemberNotification` con `readStatus=UNREAD`, título, cuerpo, `event` y fecha de creación, visible en `GET /notifications` de ese socio y de ningún otro.
2. Emitir un evento crea además un registro `Notification` con `createdBy=SYSTEM`, `segment=SINGLE`, `targetMemberId`, `event` y `recipientCount=1`, para que cuente en las métricas de enviadas.
3. Existe un texto en español para cada uno de los trece eventos del catálogo; un evento fuera del catálogo se rechaza en el código, no se envía con un texto genérico.
4. Los textos solo incluyen lo necesario para el socio (nombre de pila, instalación, fecha y hora en `America/Lima`, plan, monto, motivo cuando aplique). Nunca DNI completo, datos de tarjeta, identificadores internos de Stripe ni datos de otros socios.
5. Se envía un correo al email del socio usando la plantilla del evento. El correo es _best-effort_: si SES falla (incluido un destinatario no verificado en el sandbox), la notificación interna igual queda creada y la operación de negocio que originó el evento **no** se revierte ni devuelve error al usuario.
6. Un fallo al enviar el correo queda registrado en el log estructurado con el evento, el `memberId` y el motivo, sin el contenido del mensaje ni el email completo.
7. Si falla el registro de la notificación interna, la operación de negocio ya confirmada **no** se revierte (ya está escrita) y el fallo queda registrado con alarma (ADR-0008). Ver pregunta abierta 3 de EP-05.
8. La emisión de un mismo evento para el mismo hecho es idempotente: un reintento no deja dos notificaciones en la bandeja (la clave de idempotencia la define el Arquitecto; por ejemplo, derivada del evento y del identificador del hecho).
9. Las plantillas de correo SES se definen en Terraform, una por evento, y su contenido coincide con el texto de la bandeja.
10. El módulo tiene pruebas unitarias del armado de textos por evento y de los tres caminos: todo bien, correo falla, bandeja falla.

## Casos alternativos / excepciones

- **Socio sin cuenta digital** (`MIGRATED` sin activar): no recibe eventos automáticos. Casi ninguno puede ocurrirle antes de activarse; los avisos de renovación (US-047) lo excluyen de forma explícita.
- **SES en sandbox**: en `dev` los correos solo llegan a direcciones verificadas; la demo usa socios de prueba con correo verificado.
- **Preferencias de correo del socio** (darse de baja de correos): no está en el Contexto Maestro; queda fuera de esta historia.

## Sugerencia de pruebas funcionales

- Emitir `PAYMENT_SUCCEEDED` a un socio → aparece en su bandeja como no leída y no en la de otro.
- Simular fallo de SES → la notificación interna existe y la operación de origen responde éxito.
- Revisión de los trece textos: sin datos sensibles (enlaza con T-04).
- Reintento del mismo evento → una sola notificación en la bandeja.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-NOT-01, RN-NOT-02, RN-NOT-04, RN-PAG-08.
- Casos de prueba: N-01, N-03, N-11 (habilitados); T-04.
- Depende de: US-039.
- Habilita: US-041, US-042, US-043, US-044, US-045, US-046, US-047.
