// Mensajes de error de los bloqueos por mantenimiento (US-035).
//
// Traducción centralizada por `error.code` (docs/api/contratos-api.md §1.3 y
// §6). Nunca se muestra `error.message` ni `details` crudos del servidor.

import { ApiRequestError } from '../../lib/api/http-client';

export interface MaintenanceFeedback {
  title: string;
  message: string;
  /** El bloqueo o el recurso cambió: refrescar la lista de bloqueos. */
  refresh: boolean;
  sessionExpired: boolean;
}

function feedback(
  title: string,
  message: string,
  flags: Partial<Pick<MaintenanceFeedback, 'refresh' | 'sessionExpired'>> = {},
): MaintenanceFeedback {
  return { title, message, refresh: false, sessionExpired: false, ...flags };
}

/** Errores comunes a crear y liberar. Devuelve `null` si no aplica. */
function commonFeedback(error: unknown): MaintenanceFeedback | null {
  if (!(error instanceof ApiRequestError)) {
    return null;
  }
  switch (error.code) {
    case 'FORBIDDEN':
      return feedback(
        'No tienes permiso para esta acción',
        'Tu cuenta no puede gestionar bloqueos por mantenimiento. Si crees que es un error, contacta al responsable del sistema.',
      );
    case 'UNAUTHENTICATED':
      return feedback(
        'Tu sesión expiró',
        'No se realizó ningún cambio. Inicia sesión nuevamente para continuar.',
        { sessionExpired: true },
      );
    default:
      return null;
  }
}

/** Traduce un error de `POST /resources/{id}/maintenance`. */
export function toCreateBlockFeedback(error: unknown): MaintenanceFeedback {
  const common = commonFeedback(error);
  if (common) {
    return common;
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'VALIDATION_ERROR':
        return feedback(
          'El servidor no aceptó el bloqueo',
          'Revisa que la fecha y hora de fin sean posteriores a las de inicio y que el motivo no supere los 280 caracteres.',
        );
      case 'NOT_FOUND':
        return feedback(
          'No encontramos la instalación',
          'La instalación ya no existe en el catálogo. Actualiza la pantalla e intenta de nuevo.',
        );
      case 'NETWORK_ERROR':
        return feedback(
          'No pudimos conectar con el servidor',
          'No recibimos respuesta. El bloqueo podría haberse creado: revisa la lista de bloqueos antes de volver a intentar.',
          { refresh: true },
        );
      default:
        break;
    }
  }
  return feedback(
    'No pudimos crear el bloqueo',
    'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
  );
}

/** Traduce un error de `DELETE /resources/{id}/maintenance/{blockId}`. */
export function toReleaseBlockFeedback(error: unknown): MaintenanceFeedback {
  const common = commonFeedback(error);
  if (common) {
    return common;
  }
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return feedback(
          'El bloqueo ya no existe',
          'Ya fue liberado (quizá por otro administrador). Actualizamos la lista.',
          { refresh: true },
        );
      case 'NETWORK_ERROR':
        return feedback(
          'No pudimos conectar con el servidor',
          'No recibimos respuesta. El bloqueo podría haberse liberado: revisa la lista antes de volver a intentar.',
          { refresh: true },
        );
      default:
        break;
    }
  }
  return feedback(
    'No pudimos liberar el bloqueo',
    'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
  );
}

/** Mensaje para un fallo al cargar los bloqueos de un recurso. */
export function toBlocksLoadError(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return {
          message: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
          sessionExpired: true,
        };
      case 'FORBIDDEN':
        return {
          message: 'Tu cuenta no tiene permiso para consultar los bloqueos.',
          sessionExpired: false,
        };
      case 'NOT_FOUND':
        return { message: 'No encontramos la instalación elegida.', sessionExpired: false };
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
