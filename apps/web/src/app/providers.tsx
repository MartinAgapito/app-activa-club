import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@activa-club/ui';
import { createQueryClient } from '../lib/query-client';
import { AuthProvider } from '../auth/AuthContext';

/** Composición de providers de la aplicación: TanStack Query, auth y avisos
 * efímeros (`useToast()` disponible en toda la app, US-066). */
export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
