// Traducción de los errores de `POST /reservations` (y de las búsquedas por
// DNI) a mensajes en español accionables — US-032, criterio 8.
//
// Centraliza la traducción por `error.code` (docs/api/contratos-api.md §1.3 y
// §7), igual que `payments/payment-outcome.ts`. Nunca se muestra el
// `message` crudo ni los `details` del servidor: pueden contener datos
// internos (T-05). La interfaz anticipa, pero el servidor decide (criterio 14).

import { ApiRequestError } from '../lib/api/http-client';

export interface ReservationErrorFeedback {
  /** Código del contrato que originó el mensaje (para pruebas y trazas). */
  code: string;
  title: string;
  message: string;
  /** Criterio 9: la franja o el recurso cambió, hay que refrescar la
   * disponibilidad del día conservando instalación y participantes. */
  refreshAvailability: boolean;
  /** Criterio 10: el socio debe ser dirigido al pago de su membresía. */
  showPaymentLink: boolean;
  /** Caso alternativo "sesión expirada al confirmar". */
  sessionExpired: boolean;
  /** Caso alternativo "fallo de red": la reserva podría haberse creado. */
  mayHaveBeenCreated: boolean;
}

type FeedbackFlags = Partial<
  Pick<
    ReservationErrorFeedback,
    'refreshAvailability' | 'showPaymentLink' | 'sessionExpired' | 'mayHaveBeenCreated'
  >
>;

function feedback(
  code: string,
  title: string,
  message: string,
  flags: FeedbackFlags = {},
): ReservationErrorFeedback {
  return {
    code,
    title,
    message,
    refreshAvailability: false,
    showPaymentLink: false,
    sessionExpired: false,
    mayHaveBeenCreated: false,
    ...flags,
  };
}

const GENERIC = feedback(
  'INTERNAL_ERROR',
  'No pudimos crear la reserva',
  'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
);

/** Traduce un error de `POST /reservations` a un mensaje de UI. */
export function toReservationErrorFeedback(error: unknown): ReservationErrorFeedback {
  if (!(error instanceof ApiRequestError)) {
    return GENERIC;
  }

  switch (error.code) {
    case 'RESERVATION_OVERLAP':
      return feedback(
        error.code,
        'Esa franja ya fue tomada',
        'Otra reserva ocupó esta franja mientras completabas los datos. Actualizamos la disponibilidad: elige otro horario y conservamos tus participantes.',
        { refreshAvailability: true },
      );
    case 'RESOURCE_IN_MAINTENANCE':
      return feedback(
        error.code,
        'La instalación está en mantenimiento',
        'La instalación no admite reservas en este horario por mantenimiento. Actualizamos la disponibilidad: elige otra franja u otra instalación.',
        { refreshAvailability: true },
      );
    case 'PARTICIPANT_OVERLAP':
      return feedback(
        error.code,
        'Un participante ya tiene otra reserva en ese horario',
        'Tú o alguno de los participantes ya tiene una reserva activa que se superpone con esta franja. Elige otro horario o quita a esa persona.',
      );
    case 'CAPACITY_EXCEEDED':
      return feedback(
        error.code,
        'Se superó el aforo de la instalación',
        'La cantidad de participantes supera el aforo permitido. Quita participantes e intenta nuevamente.',
      );
    case 'GUEST_MONTHLY_LIMIT':
      return feedback(
        error.code,
        'Un invitado alcanzó su límite mensual',
        'Uno de los invitados externos ya tiene dos visitas este mes y no puede ser invitado de nuevo. Quítalo de la lista o elige a otra persona.',
      );
    case 'OUTSIDE_SCHEDULE':
      return feedback(
        error.code,
        'Fuera del horario de la instalación',
        'La franja elegida queda fuera del horario de atención de la instalación. Elige otra franja.',
        { refreshAvailability: true },
      );
    case 'MEMBER_HAS_DEBT':
      return feedback(
        error.code,
        'Tienes un saldo pendiente',
        'No puedes reservar mientras tengas una deuda de membresía. Regulariza tu pago para volver a reservar.',
        { showPaymentLink: true },
      );
    case 'MEMBERSHIP_REQUIRED':
      return feedback(
        error.code,
        'Necesitas una membresía vigente',
        'Para reservar tu membresía debe estar vigente. Renueva o paga tu membresía para continuar.',
        { showPaymentLink: true },
      );
    case 'VALIDATION_ERROR':
      return feedback(
        error.code,
        'Revisa los datos de la reserva',
        'Algún dato de la reserva no es válido. Revisa la franja, los DNI y los nombres de los participantes e intenta nuevamente.',
      );
    case 'NOT_FOUND':
      return feedback(
        error.code,
        'No encontramos a un participante',
        'Alguno de los socios agregados ya no figura en el club. Quítalo de la lista y vuelve a buscarlo por DNI.',
      );
    case 'UNAUTHENTICATED':
      return feedback(
        error.code,
        'Tu sesión expiró',
        'No se creó ninguna reserva. Inicia sesión nuevamente para continuar.',
        { sessionExpired: true },
      );
    case 'FORBIDDEN':
      return feedback(
        error.code,
        'No tienes permiso para reservar',
        'Tu cuenta no puede crear reservas. Si crees que es un error, contacta al club.',
      );
    case 'NETWORK_ERROR':
      return feedback(
        error.code,
        'No pudimos conectar con el servidor',
        'No recibimos respuesta del servidor. Puedes reintentar; ten en cuenta que la reserva podría haberse creado, así que verifica tus reservas antes de volver a enviarla.',
        { mayHaveBeenCreated: true },
      );
    default:
      return GENERIC;
  }
}

/** Mensaje para un fallo de `GET /members/lookup` o `GET /guests/lookup` que
 * no sea el 404 esperable (ese se maneja como "no encontrado"). */
export function toLookupErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.code === 'VALIDATION_ERROR') {
      return 'Ingresa un DNI válido de 8 dígitos.';
    }
    if (error.code === 'NETWORK_ERROR') {
      return 'No pudimos conectar con el servidor. Revisa tu conexión e intenta buscar de nuevo.';
    }
    if (error.code === 'UNAUTHENTICATED') {
      return 'Tu sesión expiró. Inicia sesión nuevamente para continuar.';
    }
  }
  return 'No pudimos buscar ese DNI. Intenta nuevamente en unos minutos.';
}

/** Paso del asistente donde se corrige cada error de `POST /reservations`
 * (US-072, criterio 10): la franja (paso 2), los participantes (paso 3) o la
 * propia confirmación (paso 4). */
export type ReservationErrorTarget = 'SLOT' | 'PARTICIPANTS' | 'CONFIRM';

export function reservationErrorTarget(code: string): ReservationErrorTarget {
  switch (code) {
    case 'RESERVATION_OVERLAP':
    case 'RESOURCE_IN_MAINTENANCE':
    case 'OUTSIDE_SCHEDULE':
      return 'SLOT';
    case 'CAPACITY_EXCEEDED':
    case 'PARTICIPANT_OVERLAP':
    case 'GUEST_MONTHLY_LIMIT':
    case 'NOT_FOUND':
      return 'PARTICIPANTS';
    default:
      return 'CONFIRM';
  }
}
