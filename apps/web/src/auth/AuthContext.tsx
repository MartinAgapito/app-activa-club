// Contexto de autenticación de Activa Club — placeholder de fundación (Sprint 0).
//
// ADR-0002 asigna a esta historia (US-008) el guard de rutas "como UX, no como
// control de seguridad": la autorización real siempre ocurre en el backend
// (API Gateway Cognito Authorizer + Lambda). Este contexto todavía NO integra
// Amazon Cognito (login/refresh/logout); eso es trabajo de Sprint 1 sobre esta
// misma interfaz. Por defecto expone una sesión anónima.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@activa-club/shared-types';

export type AuthStatus = 'anonymous' | 'authenticated';

export interface AuthSession {
  status: AuthStatus;
  role: Role | null;
  memberId: string | null;
}

export interface AuthContextValue extends AuthSession {
  /** Utilidad de desarrollo/pruebas para simular sesión mientras no existe
   * integración real con Cognito. No debe usarse desde pantallas de negocio. */
  setSession: (session: AuthSession) => void;
  signOut: () => void;
}

const ANONYMOUS_SESSION: AuthSession = { status: 'anonymous', role: null, memberId: null };

/** Exportado además de `useAuth`/`AuthProvider` para poder inyectar sesiones
 * de prueba en tests (ver RequireRole.test.tsx). No debe consumirse
 * directamente desde pantallas de negocio: usar siempre `useAuth()`. */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(ANONYMOUS_SESSION);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      setSession,
      signOut: () => setSession(ANONYMOUS_SESSION),
    }),
    [session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return context;
}
