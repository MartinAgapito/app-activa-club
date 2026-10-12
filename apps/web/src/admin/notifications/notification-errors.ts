// Mensajes de error de la consola de notificaciones (US-049).
//
// Traducción centralizada por `error.code` (docs/api/contratos-api.md §1.3 y
// §8). Nunca se muestra `error.message` ni `details` crudos del servidor.

import type { NotificationSegment } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { RECIPIENT_LIMIT } from './notification-form';

export interface PublishFeedback {
  title: string;
  message: string;
  /** El administrador puede volver a intentar tal cual (red o error del servidor). */
  retryable: boolean;
  sessionExpired: boolean;
}

function feedback(
  title: string,
  message: string,
  flags: Partial<Pick<PublishFeedback, 'retryable' | 'sessionExpired'>> = {},
): PublishFeedback {
  return { title, message, retryable: false, sessionExpired: false, ...flags };
}

/** Traduce un error de `POST /notifications`. `segment` precisa el 404. */
export function toPublishFeedback(error: unknown, segment: NotificationSegment): PublishFeedback {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'NO_RECIPIENTS':
        return feedback(
          'Ese segmento no tiene destinatarios',
          'No se envió nada. Elige otro segmento o revisa el criterio.',
        );
      case 'RECIPIENT_LIMIT_EXCEEDED':
        return feedback(
          `El segmento supera el máximo de ${RECIPIENT_LIMIT} destinatarios`,
          'No se envió nada. Elige un segmento más acotado.',
        );
      case 'NOT_FOUND':
        if (segment === 'SINGLE') {
          return feedback(
            'No encontramos al socio',
            'El socio no existe o aún no tiene cuenta digital. Revisa el DNI e intenta de nuevo.',
          );
        }
        if (segment === 'BY_RESOURCE') {
          return feedback(
            'No encontramos la instalación',
            'La instalación ya no existe en el catálogo. Elige otra de la lista.',
          );
        }
        return feedback('No encontramos el destinatario', 'Revisa el segmento e intenta de nuevo.');
      case 'VALIDATION_ERROR':
        return feedback(
          'El servidor no aceptó el aviso',
          'Revisa que el título tenga hasta 120 caracteres, el mensaje hasta 2000 y el destinatario esté completo.',
        );
      case 'FORBIDDEN':
        return feedback(
          'No tienes permiso para publicar',
          'Tu cuenta no puede publicar notificaciones. Si crees que es un error, contacta al responsable del sistema.',
        );
      case 'UNAUTHENTICATED':
        return feedback(
          'Tu sesión expiró',
          'No se envió nada. Inicia sesión nuevamente para continuar.',
          { sessionExpired: true },
        );
      case 'NETWORK_ERROR':
        return feedback(
          'No pudimos conectar con el servidor',
          'No recibimos respuesta y el aviso podría haberse publicado. Revisa la pestaña "Enviadas" antes de reintentar; si repites el mismo aviso en los próximos 5 minutos no se duplicará.',
          { retryable: true },
        );
      default:
        break;
    }
  }
  return feedback(
    'No pudimos publicar el aviso',
    'Ocurrió un error inesperado. Revisa la pestaña "Enviadas" e intenta nuevamente en unos minutos.',
    { retryable: true },
  );
}

/** Mensaje para un fallo al cargar el historial o la lista de instalaciones. */
export function toLoadError(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return {
          message: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
          sessionExpired: true,
        };
      case 'FORBIDDEN':
        return {
          message: 'Tu cuenta no tiene permiso para consultar las notificaciones.',
          sessionExpired: false,
        };
      case 'NETWORK_ERROR':
        return {
          message: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
          sessionExpired: false,
        };
      default:
        break;
    }
  }
  return {
    message: 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
    sessionExpired: false,
  };
}

/** Mensaje para un fallo en la búsqueda de un socio por DNI. */
export function toLookupMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'DNI_NOT_FOUND':
      case 'NOT_FOUND':
        return 'No encontramos un socio con ese DNI.';
      case 'NETWORK_ERROR':
        return 'No pudimos conectar con el servidor. Intenta de nuevo.';
      default:
        break;
    }
  }
  return 'No se pudo realizar la búsqueda. Intenta nuevamente.';
}
