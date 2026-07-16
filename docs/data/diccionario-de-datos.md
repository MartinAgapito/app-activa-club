# Diccionario de datos — Activa Club

> Significado de atributos y enumeraciones del modelo
> [DynamoDB](./modelo-dynamodb.md). Los mismos nombres se reflejan en
> `packages/shared-types` y se validan en `packages/validation`.

## 1. Enumeraciones (estados del dominio)

| Enum                     | Valores                                                                                                                                                                                                                                                                              | Descripción                                   | Regla                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------- |
| `Role`                   | `member`, `admin`                                                                                                                                                                                                                                                                    | Rol del usuario (grupo de Cognito)            | Contexto Maestro      |
| `MemberOrigin`           | `MIGRATED`, `NEW`                                                                                                                                                                                                                                                                    | Procedencia del socio                         | RN-MIG-05 / RN-ACT-05 |
| `MemberStatus`           | `MIGRATED`, `PENDING`, `APPROVED`, `REJECTED`, `ACTIVE`                                                                                                                                                                                                                              | Ciclo de vida del socio                       | RN-ACT-06/07          |
| `MembershipType`         | `MONTHLY`, `ANNUAL`                                                                                                                                                                                                                                                                  | Tipo de membresía                             | RN-PAG-01             |
| `MembershipStatus`       | `ACTIVE`, `EXPIRING_SOON`, `EXPIRED`, `DEBT`, `NONE`                                                                                                                                                                                                                                 | Estado de membresía del socio                 | RN-PAG-06             |
| `PaymentStatus`          | `PENDING_CONFIRMATION`, `SUCCEEDED`, `FAILED`                                                                                                                                                                                                                                        | Estado del pago                               | RN-PAG-07             |
| `ResourceType`           | `FUTBOL`, `TENIS`, `PADEL`, `PISCINA`, `PARRILLA`, `SALON_SOCIAL`                                                                                                                                                                                                                    | Tipo de recurso                               | RN-RES                |
| `ResourceStatus`         | `AVAILABLE`, `MAINTENANCE`                                                                                                                                                                                                                                                           | Disponibilidad del recurso                    | RN-RES-11             |
| `ReservationStatus`      | `CONFIRMED`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `CANCELLED`                                                                                                                                                                                                                 | Estado de la reserva                          | RN-RES-01/02/10       |
| `ParticipantType`        | `HOLDER`, `MEMBER`, `GUEST`                                                                                                                                                                                                                                                          | Tipo de participante                          | RN-RES-03/06          |
| `NotificationSegment`    | `ALL`, `ACTIVE`, `DEBT`, `EXPIRED`, `EXPIRING_SOON`, `SINGLE`, `BY_RESOURCE`                                                                                                                                                                                                         | Segmento destinatario                         | RN-NOT-03             |
| `NotificationEvent`      | `ACCOUNT_ACTIVATED`, `MEMBER_APPROVED`, `MEMBER_REJECTED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `RENEWAL_DUE`, `RENEWAL_OVERDUE`, `RESERVATION_CONFIRMED`, `RESERVATION_CANCELLED`, `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_MAINTENANCE`, `RESERVATION_REMINDER` | Evento automático que origina la notificación | RN-NOT-04             |
| `NotificationReadStatus` | `UNREAD`, `READ`                                                                                                                                                                                                                                                                     | Estado de lectura en el inbox                 | RN-NOT-01             |
| `AuditAction`            | `MEMBER_APPROVED`, `MEMBER_REJECTED`, `RESERVATION_APPROVED`, `RESERVATION_REJECTED`, `RESOURCE_UPDATED`, `RESOURCE_MAINTENANCE`, `NOTIFICATION_SENT`, `MIGRATION_RUN`                                                                                                               | Acción administrativa auditada                | RN-ADM                |
| `Currency`               | `PEN`                                                                                                                                                                                                                                                                                | Moneda (soles)                                | Culqi PE              |

## 2. Atributos por entidad

### Member

| Atributo                  | Tipo               | Nulo | Descripción                                                    |
| ------------------------- | ------------------ | ---- | -------------------------------------------------------------- |
| `memberId`                | string (ULID)      | no   | Identificador interno del socio                                |
| `legacyId`                | string             | sí   | Identificador legado del on-premise; solo migrados (RN-MIG-05) |
| `dni`                     | string             | no   | Documento de identidad; único (RN-ACT-03)                      |
| `email`                   | string             | no   | Correo; único; login vía Cognito                               |
| `firstName`               | string             | no   | Nombres                                                        |
| `lastName`                | string             | no   | Apellidos                                                      |
| `phone`                   | string             | sí   | Teléfono de contacto                                           |
| `origin`                  | `MemberOrigin`     | no   | `MIGRATED` o `NEW`                                             |
| `memberStatus`            | `MemberStatus`     | no   | Estado del ciclo de vida                                       |
| `cognitoSub`              | string             | sí   | `sub` del usuario Cognito; null hasta activar                  |
| `rejectionReason`         | string             | sí   | Motivo de rechazo (socio nuevo)                                |
| `membershipType`          | `MembershipType`   | sí   | Tipo de membresía vigente                                      |
| `membershipStatus`        | `MembershipStatus` | no   | Estado de membresía (denormalizado)                            |
| `membershipStartedAt`     | string (ISO)       | sí   | Inicio del período vigente                                     |
| `membershipEndsAt`        | string (ISO)       | sí   | Vencimiento del período vigente                                |
| `outstandingBalance`      | number             | no   | Saldo pendiente en céntimos (0 si no debe)                     |
| `autoRenew`               | boolean            | no   | Renovación automática opt-in (RN-PAG-03)                       |
| `createdAt` / `updatedAt` | string (ISO)       | no   | Marcas de tiempo                                               |

### MembershipPeriod

| Atributo               | Tipo               | Nulo | Descripción                 |
| ---------------------- | ------------------ | ---- | --------------------------- |
| `membershipId`         | string (ULID)      | no   | Id del período              |
| `type`                 | `MembershipType`   | no   | Tipo del período            |
| `startedAt` / `endsAt` | string (ISO)       | no   | Vigencia                    |
| `status`               | `MembershipStatus` | no   | Estado del período          |
| `paymentId`            | string             | sí   | Pago que originó el período |

### Payment

| Atributo                    | Tipo             | Nulo  | Descripción                             |
| --------------------------- | ---------------- | ----- | --------------------------------------- |
| `paymentId`                 | string (ULID)    | no    | Id del pago                             |
| `memberId`                  | string           | no    | Socio pagador                           |
| `membershipType`            | `MembershipType` | no    | Membresía adquirida                     |
| `amount`                    | number           | no    | Monto en céntimos                       |
| `currency`                  | `Currency`       | no    | Moneda (`PEN`)                          |
| `paymentStatus`             | `PaymentStatus`  | no    | Estado del pago                         |
| `culqiChargeId`             | string           | sí    | Id del cargo en Culqi                   |
| `idempotencyKey`            | string           | no    | Clave de idempotencia (RT-01)           |
| `autoRenewRequested`        | boolean          | no    | El socio autorizó renovación automática |
| `failureReason`             | string           | sí    | Motivo de fallo                         |
| `createdAt` / `confirmedAt` | string (ISO)     | no/sí | Creación / confirmación segura          |

> Prohibido: número de tarjeta (PAN), CVV, fecha de tarjeta, llave privada Culqi
> (RN-PAG-08).

### Resource

| Atributo               | Tipo             | Nulo | Descripción                           |
| ---------------------- | ---------------- | ---- | ------------------------------------- |
| `resourceId`           | string (slug)    | no   | Id legible del recurso                |
| `type`                 | `ResourceType`   | no   | Tipo de recurso                       |
| `name`                 | string           | no   | Nombre visible                        |
| `capacity`             | number           | no   | Aforo máximo (RN-RES-09)              |
| `blockMinutes`         | number           | no   | Duración de bloque en minutos         |
| `opensAt` / `closesAt` | string (`HH:mm`) | no   | Horario operativo                     |
| `requiresApproval`     | boolean          | no   | Requiere aprobación admin (RN-RES-02) |
| `resourceStatus`       | `ResourceStatus` | no   | Disponible o en mantenimiento         |

### Reservation

| Atributo                      | Tipo                | Nulo | Descripción                              |
| ----------------------------- | ------------------- | ---- | ---------------------------------------- |
| `reservationId`               | string (ULID)       | no   | Id de la reserva                         |
| `resourceId` / `resourceType` | string              | no   | Recurso reservado                        |
| `holderMemberId`              | string              | no   | Socio titular responsable (RN-RES-06)    |
| `startsAt` / `endsAt`         | string (ISO)        | no   | Ventana de la reserva                    |
| `reservationStatus`           | `ReservationStatus` | no   | Estado de la reserva                     |
| `participantCount`            | number              | no   | Total de participantes (incluye titular) |
| `guestCount`                  | number              | no   | Invitados externos                       |
| `requiresApproval`            | boolean             | no   | Copiado del recurso al crear             |
| `rejectionReason`             | string              | sí   | Motivo de rechazo admin                  |
| `cancelledAt`                 | string (ISO)        | sí   | Momento de cancelación                   |

### ReservationParticipant

| Atributo              | Tipo              | Nulo | Descripción                                             |
| --------------------- | ----------------- | ---- | ------------------------------------------------------- |
| `participantId`       | string (ULID)     | no   | Id del participante                                     |
| `participantType`     | `ParticipantType` | no   | `HOLDER`/`MEMBER`/`GUEST`                               |
| `subjectKey`          | string            | no   | `MEMBER#<id>` o `GUEST#<dni>` (índice de superposición) |
| `memberId`            | string            | sí   | Si es socio                                             |
| `guestDni`            | string            | sí   | Si es invitado externo                                  |
| `guestName`           | string            | sí   | Nombre del invitado                                     |
| `startsAt` / `endsAt` | string (ISO)      | no   | Copiados de la reserva (para consulta de solape)        |

### GuestMonthlyCounter

| Atributo         | Tipo               | Nulo | Descripción                         |
| ---------------- | ------------------ | ---- | ----------------------------------- |
| `guestDni`       | string             | no   | DNI del invitado externo            |
| `month`          | string (`yyyy-mm`) | no   | Mes calendario (America/Lima)       |
| `visitCount`     | number             | no   | Visitas del mes (máx. 2, RN-RES-05) |
| `reservationIds` | string[]           | no   | Reservas que componen el conteo     |

### MaintenanceBlock

| Atributo              | Tipo          | Nulo | Descripción              |
| --------------------- | ------------- | ---- | ------------------------ |
| `blockId`             | string (ULID) | no   | Id del bloqueo           |
| `resourceId`          | string        | no   | Recurso bloqueado        |
| `startsAt` / `endsAt` | string (ISO)  | no   | Ventana de mantenimiento |
| `reason`              | string        | sí   | Motivo                   |
| `createdBy`           | string        | no   | Admin que lo creó        |

### Notification / MemberNotification

| Atributo         | Tipo                     | Nulo | Descripción                           |
| ---------------- | ------------------------ | ---- | ------------------------------------- |
| `notificationId` | string (ULID)            | no   | Id de la notificación                 |
| `title` / `body` | string                   | no   | Contenido                             |
| `segment`        | `NotificationSegment`    | sí   | Segmento (solo en Notification admin) |
| `targetMemberId` | string                   | sí   | Destinatario único (`SINGLE`)         |
| `resourceId`     | string                   | sí   | Recurso (`BY_RESOURCE`)               |
| `event`          | `NotificationEvent`      | sí   | Evento automático de origen           |
| `alsoEmail`      | boolean                  | no   | Si además se envió correo SES         |
| `createdBy`      | string                   | no   | Admin id o `SYSTEM`                   |
| `recipientCount` | number                   | sí   | Nº de destinatarios (Notification)    |
| `readStatus`     | `NotificationReadStatus` | no   | Solo en MemberNotification            |
| `readAt`         | string (ISO)             | sí   | Momento de lectura                    |

### AuditLog

| Atributo     | Tipo          | Nulo | Descripción                         |
| ------------ | ------------- | ---- | ----------------------------------- |
| `auditId`    | string (ULID) | no   | Id de auditoría                     |
| `actorId`    | string        | no   | Admin/usuario que ejecuta la acción |
| `actorRole`  | `Role`        | no   | Rol del actor                       |
| `action`     | `AuditAction` | no   | Acción auditada                     |
| `targetType` | string        | no   | Tipo de entidad afectada            |
| `targetId`   | string        | no   | Id de la entidad afectada           |
| `metadata`   | map           | sí   | Datos adicionales de contexto       |
| `timestamp`  | string (ISO)  | no   | Momento de la acción                |

## 3. Notas de unidades y formato

- **Dinero**: enteros en **céntimos** (`amount`, `outstandingBalance`) para
  evitar errores de coma flotante. `10000` = S/ 100.00.
- **Fechas**: ISO-8601 UTC en almacenamiento; reglas de calendario en
  `America/Lima`.
- **Horas de recurso** (`opensAt`/`closesAt`): `HH:mm` en hora local del club.
