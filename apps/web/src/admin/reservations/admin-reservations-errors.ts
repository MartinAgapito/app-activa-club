// Mensajes de error de la gestión administrativa de reservas (US-034/US-036).
//
// Traducción centralizada por `error.code` (docs/api/contratos-api.md §1.3 y
// §7). Nunca se muestra `error.message` ni `details` crudos del servidor.

import { ApiRequestError } from '../../lib/api/http-client';

export interface AdminReservationFeedback {
  title: string;
  message: string;
  /** El estado de la reserva pudo cambiar: refrescar bandeja y lista. */
  refresh: boolean;
  sessionExpired: boolean;
}

function feedback(
  title: string,
  message: string,
  flags: Partial<Pick<AdminReservationFeedback, 'refresh' | 'sessionExpired'>> = {},
): AdminReservationFeedback {
  return { title, message, refresh: false, sessionExpired: false, ...flags };
}

export type AdminReservationAction = 'approve' | 'reject' | 'cancel';

const ACTION_FAILED_TITLE: Record<AdminReservationAction, string> = {
  approve: 'No pudimos aprobar la solicitud',
  reject: 'No pudimos rechazar la solicitud',
  cancel: 'No pudimos cancelar la reserva',
};

/** Traduce un error de aprobar, rechazar o cancelar una reserva. */
export function toAdminActionFeedback(
  error: unknown,
  action: AdminReservationAction,
): AdminReservationFeedback {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'RESERVATION_NOT_PENDING':
        return feedback(
          'La solicitud ya no está pendiente',
          'Otro administrador ya la resolvió o el socio la canceló. No se hizo ningún cambio; actualizamos la bandeja.',
          { refresh: true },
        );
      case 'CONFLICT':
        return feedback(
          'La reserva ya no está activa',
          'Esta reserva ya había sido cancelada o rechazada. Actualizamos la lista.',
          { refresh: true },
        );
      case 'VALIDATION_ERROR':
        return feedback(
          'El servidor no aceptó la solicitud',
          action === 'reject'
            ? 'Revisa el motivo: debe tener entre 3 y 280 caracteres.'
            : 'Los datos enviados no son válidos. Actualiza la pantalla e intenta de nuevo.',
        );
      case 'NOT_FOUND':
        return feedback(
          'No encontramos la reserva',
          'La reserva ya no existe o no está disponible. Actualizamos la lista.',
          { refresh: true },
        );
      case 'FORBIDDEN':
        return feedback(
          'No tienes permiso para esta acción',
          'Tu cuenta no puede gestionar reservas. Si crees que es un error, contacta al responsable del sistema.',
        );
      case 'UNAUTHENTICATED':
        return feedback(
          'Tu sesión expiró',
          'No se realizó ningún cambio. Inicia sesión nuevamente para continuar.',
          { sessionExpired: true },
        );
      case 'NETWORK_ERROR':
        return feedback(
          'No pudimos conectar con el servidor',
          'No recibimos respuesta. La acción podría haberse registrado: revisa la lista antes de volver a intentar.',
          { refresh: true },
        );
      default:
        break;
    }
  }
  return feedback(
    ACTION_FAILED_TITLE[action],
    'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
  );
}

/** Mensaje para un fallo al cargar la bandeja, la lista o un detalle. */
export function toAdminLoadError(error: unknown): { message: string; sessionExpired: boolean } {
  if (error instanceof ApiRequestError) {
    switch (error.code) {
      case 'UNAUTHENTICATED':
        return {
          message: 'Tu sesión expiró. Inicia sesión nuevamente para continuar.',
          sessionExpired: true,
        };
      case 'FORBIDDEN':
        return {
          message: 'Tu cuenta no tiene permiso para consultar las reservas del club.',
          sessionExpired: false,
        };
      case 'NETWORK_ERROR':
        return {
          message: 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
          sessionExpired: false,
        };
      case 'NOT_FOUND':
        return { message: 'No encontramos esta reserva.', sessionExpired: false };
      case 'VALIDATION_ERROR':
        return {
          message: 'Los filtros elegidos no son válidos. Revísalos e intenta de nuevo.',
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
