// Mensajes de error de la gestión administrativa de recursos (US-036).
//
// Traducción centralizada por `error.code` (docs/api/contratos-api.md §1.3 y
// §6). Nunca se muestra `error.message` ni `details` crudos del servidor.

import { ApiRequestError } from '../../lib/api/http-client';

export interface ResourceActionFeedback {
  title: string;
  message: string;
  /** El recurso pudo cambiar o dejar de existir: refrescar el catálogo. */
  refresh: boolean;
  sessionExpired: boolean;
}

function feedback(
  title: string,
  message: string,
  flags: Partial<Pick<ResourceActionFeedback, 'refresh' | 'sessionExpired'>> = {},
): ResourceActionFeedback {
  return { title, message, refresh: false, sessionExpired: false, ...flags };
}

/** Traduce un error de `PATCH /resources/{id}`. */
export function toResourceUpdateFeedback(error: unknown): ResourceActionFeedback {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return feedback(
          'El servidor no aceptó los cambios',
          'Revisa que el aforo sea mayor que cero y que la hora de cierre sea posterior a la de apertura.',
        );
      case 'NOT_FOUND':
        return feedback(
          'No encontramos la instalación',
          'La instalación ya no existe en el catálogo. Actualizamos la lista.',
          { refresh: true },
        );
      case 'FORBIDDEN':
        return feedback(
          'No tienes permiso para esta acción',
          'Tu cuenta no puede editar instalaciones. Si crees que es un error, contacta al responsable del sistema.',
        );
      case 'UNAUTHENTICATED':
        return feedback(
          'Tu sesión expiró',
          'No se guardó ningún cambio. Inicia sesión nuevamente para continuar.',
          { sessionExpired: true },
        );
      case 'NETWORK_ERROR':
        return feedback(
          'No pudimos conectar con el servidor',
          'No recibimos respuesta. Los cambios podrían haberse guardado: revisa la instalación antes de volver a intentar.',
          { refresh: true },
        );
      default:
        break;
    }
  }
  return feedback(
    'No pudimos guardar los cambios',
    'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
  );
}

/** Mensaje para un fallo al cargar el catálogo de instalaciones. */
export function toResourceLoadError(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return {
          message: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
          sessionExpired: true,
        };
      case 'FORBIDDEN':
        return {
          message: 'Tu cuenta no tiene permiso para gestionar las instalaciones.',
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
