// Formulario de publicación de notificaciones (US-049, criterio 3).
//
// La validación es la del contrato (`createNotificationSchema`): este módulo
// solo la ejecuta y traduce sus incidencias a mensajes claros. El servidor
// sigue siendo la fuente de verdad (400 `VALIDATION_ERROR`).

import type { FieldErrors, Resolver } from 'react-hook-form';
import type { CreateNotificationRequest, NotificationSegment } from '@activa-club/shared-types';
import { createNotificationSchema } from '@activa-club/validation';

export const TITLE_MAX_LENGTH = 120;
export const BODY_MAX_LENGTH = 2000;
/** Tope de correos por publicación (contratos-api.md §8). */
export const EMAIL_LIMIT = 15;
/** Máximo de destinatarios por publicación (contratos-api.md §8). */
export const RECIPIENT_LIMIT = 500;

export interface NotificationFormValues {
  segment: NotificationSegment;
  title: string;
  body: string;
  alsoEmail: boolean;
  /** Vacío hasta que el socio se resuelve y confirma por su nombre. */
  targetMemberId: string;
  resourceId: string;
}

export const EMPTY_NOTIFICATION_FORM: NotificationFormValues = {
  segment: 'ALL',
  title: '',
  body: '',
  alsoEmail: false,
  targetMemberId: '',
  resourceId: '',
};

type ValidatedField = 'title' | 'body' | 'targetMemberId' | 'resourceId';

const MESSAGES: Record<ValidatedField, { required: string; tooLong: string }> = {
  title: {
    required: 'Escribe un título.',
    tooLong: `El título admite hasta ${TITLE_MAX_LENGTH} caracteres.`,
  },
  body: {
    required: 'Escribe el mensaje.',
    tooLong: `El mensaje admite hasta ${BODY_MAX_LENGTH} caracteres.`,
  },
  targetMemberId: {
    required: 'Busca al socio por su DNI y confirma su nombre.',
    tooLong: 'Busca al socio por su DNI y confirma su nombre.',
  },
  resourceId: {
    required: 'Elige la instalación.',
    tooLong: 'Elige la instalación.',
  },
};

function isValidatedField(value: unknown): value is ValidatedField {
  return (
    value === 'title' || value === 'body' || value === 'targetMemberId' || value === 'resourceId'
  );
}

/** Arma el cuerpo del contrato con solo el destino que corresponde al segmento. */
export function buildNotificationRequest(
  values: NotificationFormValues,
): CreateNotificationRequest {
  return {
    segment: values.segment,
    title: values.title.trim(),
    body: values.body.trim(),
    alsoEmail: values.alsoEmail,
    ...(values.segment === 'SINGLE' && { targetMemberId: values.targetMemberId }),
    ...(values.segment === 'BY_RESOURCE' && { resourceId: values.resourceId }),
  };
}

/** Resolver de React Hook Form basado en `createNotificationSchema`. */
export const notificationFormResolver: Resolver<NotificationFormValues> = (values) => {
  const parsed = createNotificationSchema.safeParse(buildNotificationRequest(values));
  if (parsed.success) {
    return { values, errors: {} };
  }
  const errors: FieldErrors<NotificationFormValues> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (!isValidatedField(field) || errors[field]) {
      continue;
    }
    const messages = MESSAGES[field];
    errors[field] = {
      type: issue.code,
      message: issue.code === 'too_big' ? messages.tooLong : messages.required,
    };
  }
  return { values: {}, errors };
};
