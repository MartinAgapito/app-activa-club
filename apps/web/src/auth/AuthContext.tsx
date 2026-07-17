// Contexto de autenticación de Activa Club — US-014.
//
// Login directo contra Amazon Cognito (sin backend propio), según
// docs/api/contratos-api.md §2 y ADR-0002:
// - `InitiateAuth` (`USER_PASSWORD_AUTH`) para iniciar sesión.
// - `InitiateAuth` (`REFRESH_TOKEN_AUTH`) para renovar la sesión sin volver a
//   pedir credenciales, tanto al recargar la página (si hay un refresh token
//   persistido) como de forma proactiva antes de que expire el access token.
// - `GlobalSignOut` para cerrar sesión (best-effort).
//
// El rol (`member` | `admin`) se resuelve del claim `cognito:groups` del ID
// token. El guard de rutas (`RequireRole`) sigue siendo UX, no control de
// seguridad: la autorización real siempre la valida el backend contra el JWT.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Role } from '@activa-club/shared-types';
import { Spinner } from '@activa-club/ui';
import { setAccessTokenProvider } from '../lib/api/http-client';
import {
  CognitoAuthError,
  globalSignOut,
  initiateRefreshTokenAuth,
  initiateUserPasswordAuth,
  type CognitoTokens,
} from './cognito-client';
import { decodeJwtPayload } from './jwt';
import {
  clearStoredRefreshToken,
  readStoredRefreshToken,
  storeRefreshToken,
} from './session-storage';

export type AuthStatus = 'anonymous' | 'authenticated';

export interface AuthSession {
  status: AuthStatus;
  role: Role | null;
  /** Pendiente de resolver contra `GET /members/me` (fuera del alcance de
   * US-014): el ID token de Cognito solo expone `sub`, no el `memberId` de
   * dominio (ver ADR-0002, "cognitoSub → memberId"). Se completa cuando el
   * dashboard/perfil de socio (Sprint 1) consuma ese endpoint. */
  memberId: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthContextValue extends AuthSession {
  /** Login con correo y contraseña (criterio de aceptación 1). Rechaza con
   * `CognitoAuthError` si las credenciales son inválidas o la cuenta requiere
   * un paso adicional (correo sin confirmar, contraseña por restablecer). */
  signIn: (input: SignInInput) => Promise<AuthSession>;
  /** Descarta los tokens locales y revoca la sesión en Cognito (criterio de
   * aceptación 5). Síncrono desde la UI: la revocación remota es best-effort. */
  signOut: () => void;
  /** Utilidad de pruebas para inyectar sesiones simuladas directamente (ver
   * RequireRole.test.tsx). No debe usarse desde pantallas de negocio. */
  setSession: (session: AuthSession) => void;
}

const ANONYMOUS_SESSION: AuthSession = { status: 'anonymous', role: null, memberId: null };

/** Exportado además de `useAuth`/`AuthProvider` para poder inyectar sesiones
 * de prueba en tests. No debe consumirse directamente desde pantallas de
 * negocio: usar siempre `useAuth()`. */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface CognitoIdTokenClaims {
  sub: string;
  'cognito:groups'?: string[];
}

/** Renueva el access/id token un minuto antes de que expiren, mientras la
 * pestaña siga abierta (criterio de aceptación 4). */
const REFRESH_SAFETY_MARGIN_MS = 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;

function resolveRole(idToken: string): Role | null {
  const claims = decodeJwtPayload<CognitoIdTokenClaims>(idToken);
  const groups = claims?.['cognito:groups'] ?? [];
  if (groups.includes('admin')) return 'admin';
  if (groups.includes('member')) return 'member';
  return null;
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AuthSession>(ANONYMOUS_SESSION);
  // Solo hay algo que arrancar (renovar) si existe un refresh token
  // persistido; si no, se resuelve como anónimo sin esperar ningún efecto.
  const [isBootstrapping, setIsBootstrapping] = useState(() => Boolean(readStoredRefreshToken()));
  const [refreshEpoch, setRefreshEpoch] = useState(0);
  const tokensRef = useRef<StoredTokens | null>(null);

  useEffect(() => {
    setAccessTokenProvider(() => tokensRef.current?.accessToken ?? null);
  }, []);

  const applyTokens = useCallback((tokens: CognitoTokens): AuthSession => {
    const role = resolveRole(tokens.idToken);
    if (!role) {
      tokensRef.current = null;
      throw new CognitoAuthError(
        'UNKNOWN',
        'Tu cuenta no tiene un rol asignado. Contacta al administrador del club.',
      );
    }

    tokensRef.current = {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      ...(tokens.refreshToken !== undefined ? { refreshToken: tokens.refreshToken } : {}),
    };

    const nextSession: AuthSession = { status: 'authenticated', role, memberId: null };
    setSessionState(nextSession);
    setRefreshEpoch((epoch) => epoch + 1);
    return nextSession;
  }, []);

  const resetToAnonymous = useCallback(() => {
    tokensRef.current = null;
    clearStoredRefreshToken();
    setSessionState(ANONYMOUS_SESSION);
  }, []);

  // Bootstrap: si hay un refresh token persistido de una sesión anterior, la
  // renueva sin pedir credenciales de nuevo (criterio de aceptación 4).
  useEffect(() => {
    const stored = readStoredRefreshToken();
    if (!stored) {
      return;
    }

    let cancelled = false;
    initiateRefreshTokenAuth(stored)
      .then((tokens) => {
        if (!cancelled) applyTokens(tokens);
      })
      .catch(() => {
        if (!cancelled) clearStoredRefreshToken();
      })
      .finally(() => {
        if (!cancelled) setIsBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [applyTokens]);

  // Renovación proactiva: reprograma un temporizador cada vez que se aplican
  // tokens nuevos, para que la sesión siga vigente sin re-login mientras la
  // pestaña esté abierta y el refresh token no haya expirado.
  useEffect(() => {
    const current = tokensRef.current;
    if (!current?.refreshToken) {
      return;
    }
    const refreshToken = current.refreshToken;

    const delay = Math.max(
      current.expiresIn * 1000 - REFRESH_SAFETY_MARGIN_MS,
      MIN_REFRESH_DELAY_MS,
    );
    const timerId = setTimeout(() => {
      initiateRefreshTokenAuth(refreshToken)
        .then((tokens) => applyTokens(tokens))
        .catch(() => resetToAnonymous());
    }, delay);

    return () => clearTimeout(timerId);
  }, [refreshEpoch, applyTokens, resetToAnonymous]);

  const signIn = useCallback(
    async ({ email, password }: SignInInput): Promise<AuthSession> => {
      const tokens = await initiateUserPasswordAuth(email, password);
      const nextSession = applyTokens(tokens);
      if (tokens.refreshToken) {
        storeRefreshToken(tokens.refreshToken);
      }
      return nextSession;
    },
    [applyTokens],
  );

  const signOut = useCallback(() => {
    const accessToken = tokensRef.current?.accessToken ?? null;
    resetToAnonymous();
    if (accessToken) {
      void globalSignOut(accessToken).catch(() => {
        // Best-effort (criterio de aceptación 5): los tokens ya se
        // descartaron localmente aunque la revocación remota falle.
      });
    }
  }, [resetToAnonymous]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      signIn,
      signOut,
      setSession: setSessionState,
    }),
    [session, signIn, signOut],
  );

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size="lg" label="Cargando sesión…" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>.');
  }
  return context;
}
