import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CognitoAuthError,
  confirmPasswordReset,
  globalSignOut,
  initiateRefreshTokenAuth,
  initiateUserPasswordAuth,
  requestPasswordReset,
} from './cognito-client';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/x-amz-json-1.1' },
  });
}

describe('cognito-client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_testPool');
    vi.stubEnv('VITE_COGNITO_CLIENT_ID', 'test-client-id');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  describe('initiateUserPasswordAuth', () => {
    it('devuelve los tokens cuando las credenciales son correctas', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          AuthenticationResult: {
            IdToken: 'id-token',
            AccessToken: 'access-token',
            RefreshToken: 'refresh-token',
            ExpiresIn: 3600,
          },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      const tokens = await initiateUserPasswordAuth('socio@example.com', 'Sup3rSecreta!');

      expect(tokens).toEqual({
        idToken: 'id-token',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
      });

      const [endpoint, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(endpoint).toBe('https://cognito-idp.us-east-1.amazonaws.com/');
      expect(requestInit.headers).toMatchObject({
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
      });
      const body = JSON.parse(requestInit.body as string) as {
        AuthFlow: string;
        AuthParameters: { USERNAME: string; PASSWORD: string };
      };
      expect(body.AuthFlow).toBe('USER_PASSWORD_AUTH');
      expect(body.AuthParameters).toEqual({
        USERNAME: 'socio@example.com',
        PASSWORD: 'Sup3rSecreta!',
      });
    });

    it('mapea credenciales incorrectas a un mensaje genérico (criterio de aceptación 3)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'NotAuthorizedException',
            message: 'Incorrect username or password.',
          }),
        ),
      );

      await expect(
        initiateUserPasswordAuth('socio@example.com', 'incorrecta'),
      ).rejects.toMatchObject({
        reason: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos.',
      });
    });

    it('mapea usuario inexistente al mismo mensaje genérico que credenciales inválidas', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(400, { __type: 'UserNotFoundException', message: 'User does not exist.' }),
          ),
      );

      await expect(initiateUserPasswordAuth('no-existe@example.com', 'x')).rejects.toMatchObject({
        reason: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos.',
      });
    });

    it('mapea cuenta sin confirmar orientando a activación/verificación', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'UserNotConfirmedException',
            message: 'User is not confirmed.',
          }),
        ),
      );

      await expect(initiateUserPasswordAuth('socio@example.com', 'x')).rejects.toMatchObject({
        reason: 'USER_NOT_CONFIRMED',
      });
    });

    it('mapea el bloqueo temporal por intentos fallidos', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'NotAuthorizedException',
            message: 'Password attempts exceeded',
          }),
        ),
      );

      await expect(initiateUserPasswordAuth('socio@example.com', 'x')).rejects.toMatchObject({
        reason: 'TOO_MANY_ATTEMPTS',
      });
    });

    it('mapea errores de red', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      await expect(initiateUserPasswordAuth('socio@example.com', 'x')).rejects.toMatchObject({
        reason: 'NETWORK_ERROR',
      });
    });

    it('falla con un error de configuración si faltan las variables de entorno', async () => {
      vi.stubEnv('VITE_COGNITO_USER_POOL_ID', '');
      vi.stubEnv('VITE_COGNITO_CLIENT_ID', '');

      await expect(initiateUserPasswordAuth('socio@example.com', 'x')).rejects.toBeInstanceOf(
        CognitoAuthError,
      );
      await expect(initiateUserPasswordAuth('socio@example.com', 'x')).rejects.toMatchObject({
        reason: 'CONFIG_ERROR',
      });
    });
  });

  describe('initiateRefreshTokenAuth', () => {
    it('renueva la sesión y conserva el refresh token original', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(200, {
            AuthenticationResult: {
              IdToken: 'new-id-token',
              AccessToken: 'new-access-token',
              ExpiresIn: 3600,
            },
          }),
        ),
      );

      const tokens = await initiateRefreshTokenAuth('existing-refresh-token');

      expect(tokens).toEqual({
        idToken: 'new-id-token',
        accessToken: 'new-access-token',
        expiresIn: 3600,
        refreshToken: 'existing-refresh-token',
      });
    });
  });

  describe('globalSignOut', () => {
    it('invoca GlobalSignOut con el access token', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      await globalSignOut('access-token');

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(requestInit.headers).toMatchObject({
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.GlobalSignOut',
      });
      expect(JSON.parse(requestInit.body as string)).toEqual({ AccessToken: 'access-token' });
    });
  });

  describe('requestPasswordReset', () => {
    it('invoca ForgotPassword con el correo', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(200, {
          CodeDeliveryDetails: { Destination: 's***@example.com', DeliveryMedium: 'EMAIL' },
        }),
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(requestPasswordReset('socio@example.com')).resolves.toBeUndefined();

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(requestInit.headers).toMatchObject({
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ForgotPassword',
      });
      expect(JSON.parse(requestInit.body as string)).toMatchObject({
        Username: 'socio@example.com',
      });
    });

    it('se resuelve sin error cuando la cuenta no existe (criterio de aceptación 2)', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(400, { __type: 'UserNotFoundException', message: 'User does not exist.' }),
          ),
      );

      await expect(requestPasswordReset('no-existe@example.com')).resolves.toBeUndefined();
    });

    it('comunica el límite de solicitudes alcanzado', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'LimitExceededException',
            message: 'Attempt limit exceeded, please try after some time.',
          }),
        ),
      );

      await expect(requestPasswordReset('socio@example.com')).rejects.toMatchObject({
        reason: 'TOO_MANY_ATTEMPTS',
      });
    });

    it('mapea errores de red', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

      await expect(requestPasswordReset('socio@example.com')).rejects.toMatchObject({
        reason: 'NETWORK_ERROR',
      });
    });
  });

  describe('confirmPasswordReset', () => {
    it('invoca ConfirmForgotPassword con el código y la nueva contraseña', async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        confirmPasswordReset('socio@example.com', '123456', 'NuevaClave1'),
      ).resolves.toBeUndefined();

      const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(requestInit.headers).toMatchObject({
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ConfirmForgotPassword',
      });
      expect(JSON.parse(requestInit.body as string)).toEqual({
        ClientId: 'test-client-id',
        Username: 'socio@example.com',
        ConfirmationCode: '123456',
        Password: 'NuevaClave1',
      });
    });

    it('mapea un código inválido a un mensaje claro que permite reintentar (criterio de aceptación 4)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'CodeMismatchException',
            message: 'Invalid verification code provided.',
          }),
        ),
      );

      await expect(
        confirmPasswordReset('socio@example.com', '000000', 'NuevaClave1'),
      ).rejects.toMatchObject({ reason: 'INVALID_RESET_CODE' });
    });

    it('mapea un código vencido con el mismo mensaje que un código inválido', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(400, { __type: 'ExpiredCodeException', message: 'Code expired.' }),
          ),
      );

      await expect(
        confirmPasswordReset('socio@example.com', '000000', 'NuevaClave1'),
      ).rejects.toMatchObject({ reason: 'INVALID_RESET_CODE' });
    });

    it('no distingue un correo inexistente de un código inválido', async () => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(400, { __type: 'UserNotFoundException', message: 'User does not exist.' }),
          ),
      );

      await expect(
        confirmPasswordReset('no-existe@example.com', '000000', 'NuevaClave1'),
      ).rejects.toMatchObject({ reason: 'INVALID_RESET_CODE' });
    });

    it('mapea una contraseña que no cumple la política (criterio de aceptación 5)', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'InvalidPasswordException',
            message: 'Password does not conform to policy: Password must have uppercase characters',
          }),
        ),
      );

      await expect(
        confirmPasswordReset('socio@example.com', '123456', 'nueva-clave'),
      ).rejects.toMatchObject({
        reason: 'WEAK_PASSWORD',
        message: 'Password does not conform to policy: Password must have uppercase characters',
      });
    });

    it('comunica el bloqueo temporal por demasiados intentos', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse(400, {
            __type: 'TooManyFailedAttemptsException',
            message: 'Too many failed attempts.',
          }),
        ),
      );

      await expect(
        confirmPasswordReset('socio@example.com', '000000', 'NuevaClave1'),
      ).rejects.toMatchObject({ reason: 'TOO_MANY_ATTEMPTS' });
    });
  });
});
