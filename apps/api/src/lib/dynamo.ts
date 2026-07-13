// Cliente DynamoDB y helpers de claves del modelo single-table
// (docs/data/modelo-dynamodb.md). Ningún nombre de tabla, atributo o clave se
// usa aquí sin estar documentado en esa fuente de verdad primero (norma de
// ingeniería del Contexto Maestro).

import { DynamoDBClient, type DynamoDBClientConfig } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

import { getTableName, optionalEnv } from './env';

let documentClient: DynamoDBDocumentClient | undefined;

/** Config del cliente AWS: solo fija `region` si `AWS_REGION` está definida (si no, la cadena de resolución por defecto del SDK aplica; siempre presente en Lambda). */
function clientConfig(): DynamoDBClientConfig {
  const region = optionalEnv('AWS_REGION');
  return region ? { region } : {};
}

/** Cliente de documento DynamoDB, reutilizado entre invocaciones (fuera del handler). */
export function getDocumentClient(): DynamoDBDocumentClient {
  documentClient ??= DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig()), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return documentClient;
}

/** Nombre físico de la tabla única (`AppTable`, modelo-dynamodb.md §1). */
export const tableName = getTableName;

/**
 * Constructores de clave por entidad, reflejando exactamente
 * docs/data/modelo-dynamodb.md §3. Mantener este módulo como única fuente de
 * construcción de PK/SK/GSIxPK/GSIxSK del código de aplicación.
 */
export const keys = {
  // 3.1 Member
  member: (memberId: string) => ({ PK: `MEMBER#${memberId}`, SK: 'PROFILE' }),
  memberByCognitoSub: (cognitoSub: string) => ({
    GSI1PK: `COGNITO#${cognitoSub}`,
    GSI1SK: 'MEMBER',
  }),
  membersByStatus: (memberStatus: string) => ({ GSI2PK: `MEMBER#STATUS#${memberStatus}` }),

  // 3.2 / 3.3 Unicidad
  uniqueDni: (dni: string) => ({ PK: `UNIQ#DNI#${dni}`, SK: `UNIQ#DNI#${dni}` }),
  uniqueEmail: (emailLower: string) => ({
    PK: `UNIQ#EMAIL#${emailLower}`,
    SK: `UNIQ#EMAIL#${emailLower}`,
  }),

  // 3.4 MembershipPeriod
  membershipPeriod: (memberId: string, startedAt: string, membershipId: string) => ({
    PK: `MEMBER#${memberId}`,
    SK: `MEMBERSHIP#${startedAt}#${membershipId}`,
  }),

  // 3.5 Payment
  payment: (memberId: string, createdAt: string, paymentId: string) => ({
    PK: `MEMBER#${memberId}`,
    SK: `PAYMENT#${createdAt}#${paymentId}`,
  }),

  // 3.6 PaymentIdempotency
  paymentIdempotency: (idempotencyKey: string) => ({
    PK: `IDEMP#${idempotencyKey}`,
    SK: `IDEMP#${idempotencyKey}`,
  }),

  // 3.7 Resource
  resource: (resourceId: string) => ({ PK: `RESOURCE#${resourceId}`, SK: 'METADATA' }),

  // 3.8 Reservation
  reservation: (reservationId: string) => ({
    PK: `RESERVATION#${reservationId}`,
    SK: 'METADATA',
  }),
  reservationsByHolder: (holderMemberId: string) => ({ GSI1PK: `MEMBER#${holderMemberId}` }),
  reservationsByStatus: (reservationStatus: string) => ({
    GSI2PK: `RESERVATION#STATUS#${reservationStatus}`,
  }),
  reservationsByResource: (resourceId: string) => ({ GSI3PK: `RESOURCE#${resourceId}` }),

  // 3.9 ReservationParticipant
  reservationParticipant: (reservationId: string, participantId: string) => ({
    PK: `RESERVATION#${reservationId}`,
    SK: `PARTICIPANT#${participantId}`,
  }),
  participantOverlapBySubject: (subjectKey: string) => ({ GSI1PK: `SUBJECT#${subjectKey}` }),

  // 3.10 GuestMonthlyCounter
  guestMonthlyCounter: (guestDni: string, month: string) => ({
    PK: `GUEST#${guestDni}`,
    SK: `MONTH#${month}`,
  }),

  // 3.11 MaintenanceBlock
  maintenanceBlock: (resourceId: string, startsAt: string, blockId: string) => ({
    PK: `RESOURCE#${resourceId}`,
    SK: `MAINT#${startsAt}#${blockId}`,
  }),

  // 3.12 Notification
  notification: (notificationId: string) => ({
    PK: `NOTIFICATION#${notificationId}`,
    SK: 'METADATA',
  }),

  // 3.13 MemberNotification
  memberNotification: (memberId: string, createdAt: string, notificationId: string) => ({
    PK: `MEMBER#${memberId}`,
    SK: `NOTIF#${createdAt}#${notificationId}`,
  }),

  // 3.14 AuditLog
  auditLog: (yyyyMmDd: string, timestamp: string, auditId: string) => ({
    PK: `AUDIT#${yyyyMmDd}`,
    SK: `${timestamp}#${auditId}`,
  }),
} as const;
