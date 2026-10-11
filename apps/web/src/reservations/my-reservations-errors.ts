// Mensajes de error de "Mis reservas" (US-033, criterio 14).
//
// Igual que `reservation-errors.ts`: traducción centralizada por
// `error.code` (docs/api/contratos-api.md §1.3 y §7). Nunca se muestra el
// `message` crudo ni los `details` del servidor (T-05).

import { ApiRequestError } from '../lib/api/http-client';

export interface CancelErrorFeedback {
  code: string;
  title: string;
  message: string;
  /** La reserva pudo cambiar de estado: refrescar lista y disponibilidad. */
  refresh: boolean;
  sessionExpired: boolean;
}

function feedback(
  code: string,
  title: string,
  message: string,
  flags: Partial<Pick<CancelErrorFeedback, 'refresh' | 'sessionExpired'>> = {},
): CancelErrorFeedback {
  return { code, title, message, refresh: false, sessionExpired: false, ...flags };
}

/** Traduce un error de `POST /reservations/{id}/cancel`. */
export function toCancelErrorFeedback(error: unknown): CancelErrorFeedback {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'CANCELLATION_TOO_LATE':
        return feedback(
          error.code,
          'Ya no se puede cancelar',
          'Solo se puede cancelar una reserva hasta 24 horas antes de su inicio. La reserva sigue vigente.',
          { refresh: true },
        );
      case 'CONFLICT':
        return feedback(
          error.code,
          'La reserva ya no está activa',
          'Esta reserva ya había sido cancelada o rechazada. Actualizamos tu lista.',
          { refresh: true },
        );
      case 'NOT_FOUND':
        return feedback(
          error.code,
          'No encontramos la reserva',
          'La reserva no existe o ya no está disponible en tu cuenta. Actualizamos tu lista.',
          { refresh: true },
        );
      case 'UNAUTHENTICATED':
        return feedback(
          error.code,
          'Tu sesión expiró',
          'No se canceló ninguna reserva. Inicia sesión nuevamente para continuar.',
          { sessionExpired: true },
        );
      case 'FORBIDDEN':
        return feedback(
          error.code,
          'No tienes permiso para cancelar',
          'Tu cuenta no puede cancelar esta reserva. Si crees que es un error, contacta al club.',
        );
      case 'NETWORK_ERROR':
        return feedback(
          error.code,
          'No pudimos conectar con el servidor',
          'No recibimos respuesta. La cancelación podría haberse registrado: revisa tu lista antes de volver a intentar.',
          { refresh: true },
        );
      default:
        break;
    }
  }
  return feedback(
    'INTERNAL_ERROR',
    'No pudimos cancelar la reserva',
    'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
  );
}

/** Mensaje para un fallo al cargar la lista o el detalle de reservas. */
export function toLoadErrorMessage(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    if (error.code === 'UNAUTHENTICATED') {
      return {
        message: 'Tu sesión expiró. Inicia sesión nuevamente para ver tus reservas.',
        sessionExpired: true,
      };
    }
    if (error.code === 'NETWORK_ERROR') {
      return {
        message: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
        sessionExpired: false,
      };
    }
    if (error.code === 'NOT_FOUND') {
      return { message: 'No encontramos esta reserva en tu cuenta.', sessionExpired: false };
    }
  }
  return {
    message: 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
    sessionExpired: false,
  };
}
