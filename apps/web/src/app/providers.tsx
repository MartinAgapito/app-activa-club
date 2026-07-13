import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../lib/query-client';
import { AuthProvider } from '../auth/AuthContext';

/** Composición de providers de la aplicación (Sprint 0: TanStack Query + auth
 * placeholder). El proveedor de Cognito se agrega en Sprint 1. */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
