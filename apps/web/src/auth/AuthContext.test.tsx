import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from './AuthContext';
import { readStoredRefreshToken, storeRefreshToken } from './session-storage';
import { createFakeIdToken } from '../test/fake-jwt';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/x-amz-json-1.1' },
  });
}

function TestConsumer() {
  const { status, role, signIn, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <p>Estado: {status}</p>
      <p>Rol: {role ?? 'ninguno'}</p>
      {error ? <p role="alert">{error}</p> : null}
      <button
        type="button"
        onClick={() => {
          setError(null);
          signIn({ email: 'socio@example.com', password: 'Sup3rSecreta!' }).catch(
            (err: unknown) => {
              setError(err instanceof Error ? err.message : 'Error desconocido');
            },
          );
        }}
      >
        Entrar
      </button>
      <button type="button" onClick={signOut}>
        Salir
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_testPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it('arranca con sesión anónima cuando no hay refresh token guardado', async () => {
    vi.stubGlobal('fetch', vi.fn());

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(await screen.findByText('Estado: anonymous')).toBeInTheDocument();
    expect(screen.getByText('Rol: ninguno')).toBeInTheDocument();
  });

  it('inicia sesión, resuelve el rol desde cognito:groups y persiste el refresh token (criterios 1, 2 y 7)', async () => {
    const idToken = createFakeIdToken({ sub: 'user-1', 'cognito:groups': ['member'] });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        AuthenticationResult: {
          IdToken: idToken,
          AccessToken: 'access-token',
          RefreshToken: 'refresh-token-abc',
          ExpiresIn: 3600,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText('Estado: anonymous');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('Estado: authenticated')).toBeInTheDocument();
    expect(screen.getByText('Rol: member')).toBeInTheDocument();

    // La contraseña nunca se persiste; solo el refresh token (criterio 7).
    expect(readStoredRefreshToken()).toBe('refresh-token-abc');
    expect(Object.keys(window.localStorage)).toEqual(['activaclub.auth.refreshToken']);

    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string) as { AuthParameters: { PASSWORD: string } };
    expect(body.AuthParameters.PASSWORD).toBe('Sup3rSecreta!');
  });

  it('cierra sesión: descarta los tokens locales y revoca en Cognito (criterio 5)', async () => {
    const idToken = createFakeIdToken({ sub: 'user-1', 'cognito:groups': ['admin'] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, {
          AuthenticationResult: {
            IdToken: idToken,
            AccessToken: 'access-token',
            RefreshToken: 'refresh-token-abc',
            ExpiresIn: 3600,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const user = userEvent.setup();
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    await screen.findByText('Estado: anonymous');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    await screen.findByText('Estado: authenticated');

    await user.click(screen.getByRole('button', { name: 'Salir' }));

    expect(await screen.findByText('Estado: anonymous')).toBeInTheDocument();
    expect(screen.getByText('Rol: ninguno')).toBeInTheDocument();
    expect(readStoredRefreshToken()).toBeNull();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, signOutInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(signOutInit.headers).toMatchObject({
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.GlobalSignOut',
    });
  });

  it('renueva la sesión con el refresh token guardado sin pedir credenciales (criterio 4)', async () => {
    storeRefreshToken('stored-refresh-token');
    const idToken = createFakeIdToken({ sub: 'user-1', 'cognito:groups': ['admin'] });
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        AuthenticationResult: {
          IdToken: idToken,
          AccessToken: 'new-access-token',
          ExpiresIn: 3600,
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    // Mientras se resuelve el refresh silencioso, se muestra un estado de carga.
    expect(screen.getByText('Cargando sesión…')).toBeInTheDocument();

    expect(await screen.findByText('Estado: authenticated')).toBeInTheDocument();
    expect(screen.getByText('Rol: admin')).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(requestInit.body as string) as {
      AuthFlow: string;
      AuthParameters: { REFRESH_TOKEN: string };
    };
    expect(body.AuthFlow).toBe('REFRESH_TOKEN_AUTH');
    expect(body.AuthParameters.REFRESH_TOKEN).toBe('stored-refresh-token');
  });

  it('descarta un refresh token guardado que ya no es válido y queda anónimo', async () => {
    storeRefreshToken('expired-refresh-token');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        jsonResponse(400, {
          __type: 'NotAuthorizedException',
          message: 'Refresh Token has expired',
        }),
      ),
    );

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );

    expect(await screen.findByText('Estado: anonymous')).toBeInTheDocument();
    expect(readStoredRefreshToken()).toBeNull();
  });
});
