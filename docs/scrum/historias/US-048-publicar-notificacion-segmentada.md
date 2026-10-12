# US-048 — Publicar una notificación segmentada (servidor)

| Campo               | Valor                                      |
| ------------------- | ------------------------------------------ |
| ID                  | US-048                                     |
| Épica               | [EP-05](../epicas/EP-05-notificaciones.md) |
| Tipo                | Historia de usuario                        |
| Responsable         | Backend                                    |
| Fase                | MVP                                        |
| Sprint              | Sprint 4                                   |
| Prioridad           | Alta                                       |
| Estimación relativa | 5                                          |
| Dependencias        | US-038, US-039, US-040                     |

## Historia

Como **administrador**, quiero **publicar un aviso dirigido a todos los socios, a un grupo según su situación o a un socio en particular**, para **comunicar novedades, cobranzas o cambios operativos solo a quienes les corresponden**.

## Contrato de API

`POST /notifications` (admin), según `docs/api/contratos-api.md` §8. Esquema ya versionado: `createNotificationSchema` en `packages/validation/src/notification.ts` (título hasta 120 caracteres, cuerpo hasta 2000, `SINGLE` exige `targetMemberId`, `BY_RESOURCE` exige `resourceId`). Respuesta 201 `{ notificationId, recipientCount }`.

## Reglas de negocio

RN-ADM-06 (notificaciones masivas, segmentadas o individuales), RN-NOT-03 (segmentos), RN-NOT-02 (correo opcional).

## Definición funcional de los segmentos

Propuesta del Product Analyst, a confirmar por el Product Owner (pregunta abierta 10 de EP-05). Solo se consideran socios **con cuenta digital** (`ACTIVE` o `APPROVED`): los demás no tienen bandeja que leer.

| Segmento        | Destinatarios                                                                              |
| --------------- | ------------------------------------------------------------------------------------------ |
| `ALL`           | Todos los socios con cuenta digital (`memberStatus` `ACTIVE` o `APPROVED`)                 |
| `ACTIVE`        | `memberStatus=ACTIVE` con `membershipStatus` `ACTIVE` o `EXPIRING_SOON` y sin deuda        |
| `DEBT`          | `memberStatus=ACTIVE` con `membershipStatus=DEBT` o `outstandingBalance > 0`               |
| `EXPIRED`       | `memberStatus=ACTIVE` con `membershipStatus=EXPIRED`                                       |
| `EXPIRING_SOON` | `memberStatus=ACTIVE` con `membershipStatus=EXPIRING_SOON`                                 |
| `SINGLE`        | El socio indicado en `targetMemberId`, si tiene cuenta digital                             |
| `BY_RESOURCE`   | Titulares de reservas activas y futuras (`CONFIRMED`, `PENDING_APPROVAL`, `APPROVED`) allí |

## Valor de negocio

Hoy el club no tiene ningún canal para hablarle a sus socios desde la plataforma: ni para un corte de agua en la piscina, ni para recordar una deuda, ni para anunciar un evento. Es la herramienta de comunicación del administrador y una de las capacidades de administración del MVP.

## Precondiciones

- El usuario tiene sesión iniciada con rol `admin`.
- US-038 en producción: los segmentos por situación de membresía dependen de un `membershipStatus` actualizado.

## Postcondiciones

- Existe un registro `Notification` con `createdBy=<adminId>`, el segmento y el `recipientCount`.
- Cada destinatario tiene una `MemberNotification` `UNREAD` en su bandeja.
- Queda una entrada de auditoría `NOTIFICATION_SENT`.

## Criterios de aceptación

1. `POST /notifications` con un segmento válido entrega el aviso a la bandeja de **cada** destinatario del segmento según la tabla anterior, y a nadie más.
2. La respuesta 201 devuelve `recipientCount` igual al número de bandejas en las que quedó el aviso.
3. `SINGLE` sin `targetMemberId` o `BY_RESOURCE` sin `resourceId` → 400 `VALIDATION_ERROR` (el esquema ya lo exige).
4. `SINGLE` con un `targetMemberId` inexistente o sin cuenta digital, o `BY_RESOURCE` con un `resourceId` inexistente → 404 `NOT_FOUND`.
5. Un segmento sin destinatarios no registra nada y responde un error que lo explica (ver pregunta abierta 11 de EP-05; el código lo define el Arquitecto).
6. Con `alsoEmail=true`, además se envía el correo a cada destinatario, de forma _best-effort_: los fallos de correo no reducen `recipientCount` ni devuelven error (RN-NOT-02, ADR-0006).
7. Con `alsoEmail=false` no se envía ningún correo.
8. Un socio que pertenece al segmento por más de un motivo (por ejemplo, dos reservas futuras en el mismo recurso) recibe el aviso **una sola vez**.
9. La publicación queda auditada como `NOTIFICATION_SENT` con el administrador, el segmento y el `recipientCount`.
10. Un token `member` recibe 403 (cubierto por US-039; se vuelve a probar aquí con lógica real).
11. El título y el cuerpo se guardan y se muestran como texto plano; no se interpreta HTML ni se ejecuta ningún contenido.
12. Sin un `Scan` completo de la tabla: la resolución de cada segmento usa un patrón de acceso del modelo de datos que el Arquitecto confirma antes de implementar (pregunta abierta 12 de EP-05).

## Casos alternativos / excepciones

- **Socio que cambia de situación mientras se publica** (paga su deuda en ese instante): puede recibir o no el aviso de cobranza; es aceptable.
- **Volumen alto con correo**: si el envío al padrón completo no cabe en el tiempo de la Lambda o en los límites del sandbox de SES, se documenta en el PR y se escala al Arquitecto; nunca se publica a medias en la bandeja.
- **Programar una publicación para más tarde, adjuntos, imágenes o plantillas reutilizables**: fuera del alcance del MVP.

## Sugerencia de pruebas funcionales

- N-04 a N-10: un caso por segmento, con socios preparados en cada situación, verificando que el aviso llega exactamente a quienes corresponde.
- N-03: `alsoEmail=true` → se intenta el correo; con fallo de SES el aviso igual queda en las bandejas.
- `SINGLE` a un socio inexistente → 404.
- Segmento vacío → error y ningún registro creado.
- AD-05: auditoría `NOTIFICATION_SENT`.

## Trazabilidad

- Épica: EP-05
- Reglas: RN-ADM-06, RN-NOT-02, RN-NOT-03.
- Casos de prueba: N-03 a N-10, AD-05 (parte `NOTIFICATION_SENT`).
- Depende de: US-038, US-039, US-040.
- Habilita: US-049, US-052 (reutiliza la resolución de socios por situación de membresía).

## Historial de cambios

- 2026-10-12: Implementada en `apps/api/src/notifications/` (`segments.ts`, `publish.ts`, `publish-email.ts`, `sent.ts`) y `handlers/notifications/` (`create.ts`, `sent.ts`), con pruebas. Decisiones:
  - Segmento vacío: 422 `NO_RECIPIENTS` (pregunta 11). Más de 500 destinatarios, o un padrón de más de 20 páginas de 100 por estado: 422 `RECIPIENT_LIMIT_EXCEEDED`, sin publicar a medias.
  - Segmentos de situación: `Query` GSI2 de socios `ACTIVE` y filtro en memoria, sin índice nuevo (pregunta 12, patrones #28 y #32). `BY_RESOURCE` considera solo al titular de cada reserva (pregunta 4).
  - Bandeja: `Notification` + `MemberNotification` en `TransactWriteItems` de hasta 100 ítems (solo exige `dynamodb:PutItem`, ya concedido). El `notificationId` es determinista (administrador, segmento, destino, texto, `alsoEmail`, ventana de 5 minutos): un reintento completa lo que falte sin duplicar y no reenvía correos (`replayed: true`).
  - Correo: máximo 15 por publicación, uno cada 1,1 s (SES sandbox: 1/s) y ninguno nuevo pasados 22 s; el resto se informa en `emailsSkipped`.
  - Auditoría `NOTIFICATION_SENT` antes de publicar: sin rastro no se publica.
  - `GET /notifications/sent` incluye avisos automáticos con `origin` `SYSTEM` (pregunta 13); sin filtro por origen por ahora.
