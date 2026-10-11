// Mutación de creación de reserva (US-032). `POST /reservations` no es una
// consulta cacheable: se modela como mutación. Las búsquedas por DNI se
// invocan bajo demanda desde el panel de participantes.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type {
  CreateReservationRequest,
  CreateReservationResponse,
} from '@activa-club/shared-types';
import { createReservation } from './reservations-client';

export function useCreateReservationMutation(): UseMutationResult<
  CreateReservationResponse,
  Error,
  CreateReservationRequest
> {
  return useMutation({ mutationFn: (request) => createReservation(request) });
}
