// Configuración base de TanStack Query para Activa Club.
// Infraestructura genérica (sin queries/mutations de negocio todavía).

import { QueryClient } from '@tanstack/react-query';
import { ApiRequestError } from './api/http-client';

function shouldRetry(failureCount: number, error: unknown): boolean {
  // No reintentar errores de autenticación/autorización/validación: son
  // definitivos hasta que el usuario cambie algo, no fallas transitorias.
  if (error instanceof ApiRequestError) {
    if (['UNAUTHENTICATED', 'FORBIDDEN', 'VALIDATION_ERROR', 'NOT_FOUND'].includes(error.code)) {
      return false;
    }
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
