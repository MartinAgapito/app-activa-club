// Cliente mínimo contra Amazon Cognito (Identity Provider Service) — US-014 /
// US-015.
//
// Implementa exactamente las operaciones documentadas en el contrato
// (docs/api/contratos-api.md §2) y en ADR-0002: `InitiateAuth`
// (`USER_PASSWORD_AUTH`) para el login, `InitiateAuth` (`REFRESH_TOKEN_AUTH`)
// para renovar la sesión, `GlobalSignOut` para el cierre de sesión y
// `ForgotPassword` + `ConfirmForgotPassword` para la recuperación de
// contraseña. No hay backend propio para autenticación: el frontend llama
// directamente al endpoint público de Cognito.
//
// El App Client del SPA se crea sin secreto (`generate_secret = false`, ver
// infrastructure/terraform/modules/cognito-user-pool/main.tf), por lo que
// estas operaciones no requieren firma SigV4: un `fetch` JSON simple es
// suficiente y evita añadir un SDK pesado (aws-amplify / amazon-cognito-
// identity-js) solo para tres operaciones puntuales.

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  /** Ausente en la respuesta de `REFRESH_TOKEN_AUTH` (Cognito no emite un
   * refresh token nuevo en cada renovación); el llamador conserva el original. */
  refreshToken?: string;
  /** Vigencia del access/id token en segundos (política del App Client). */
  expiresIn: number;
}

export type CognitoAuthErrorReason =
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_CONFIRMED'
  | 'PASSWORD_RESET_REQUIRED'
  /** Solo de uso interno de `requestPasswordReset` (criterio de aceptación 2
   * de US-015): nunca debe propagarse a la interfaz. */
  | 'ACCOUNT_NOT_FOUND'
  | 'INVALID_RESET_CODE'
  | 'WEAK_PASSWORD'
  | 'TOO_MANY_ATTEMPTS'
  | 'NETWORK_ERROR'
  | 'CONFIG_ERROR'
  | 'UNKNOWN';

export class CognitoAuthError extends Error {
  readonly reason: CognitoAuthErrorReason;

  constructor(reason: CognitoAuthErrorReason, message: string) {
    super(message);
    this.name = 'CognitoAuthError';
    this.reason = reason;
  }
}

interface CognitoConfig {
  region: string;
  clientId: string;
}

const DEFAULT_REGION = 'us-east-1';

function readConfig(): CognitoConfig {
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID;
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;

  if (!userPoolId || !clientId) {
    throw new CognitoAuthError(
      'CONFIG_ERROR',
      'No se pudo conectar con el servicio de autenticación. Intenta más tarde.',
    );
  }

  // El User Pool ID siempre tiene el formato "<región>_<id>" (p. ej.
  // "us-east-1_ABC123xyz0"): se deriva la región de ahí para no duplicar
  // configuración, salvo que se sobrescriba explícitamente con
  // VITE_COGNITO_REGION.
  const region = import.meta.env.VITE_COGNITO_REGION ?? userPoolId.split('_')[0] ?? DEFAULT_REGION;

  return { region, clientId };
}

interface AuthenticationResultPayload {
  IdToken: string;
  AccessToken: string;
  RefreshToken?: string;
  ExpiresIn: number;
}

interface InitiateAuthResponsePayload {
  AuthenticationResult?: AuthenticationResultPayload;
  ChallengeName?: string;
}

async function callCognitoIdp<TResponse>(
  target: string,
  body: Record<string, unknown>,
  mapError: (payload: unknown) => CognitoAuthError = mapCognitoError,
): Promise<TResponse> {
  const { region } = readConfig();
  const endpoint = `https://cognito-idp.${region}.amazonaws.com/`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new CognitoAuthError(
      'NETWORK_ERROR',
      'No se pudo conectar con el servicio de autenticación. Revisa tu conexión e intenta de nuevo.',
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw mapError(payload);
  }

  return payload as TResponse;
}

function extractErrorType(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const raw = payload as Record<string, unknown>;
  const rawType = typeof raw['__type'] === 'string' ? (raw['__type'] as string) : undefined;
  const rawCode = typeof raw['code'] === 'string' ? (raw['code'] as string) : undefined;
  const type = rawType ?? rawCode;
  return type?.includes('#') ? type.split('#').pop() : type;
}

function extractErrorMessage(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  const raw = payload as Record<string, unknown>;
  if (typeof raw['message'] === 'string') return raw['message'] as string;
  if (typeof raw['Message'] === 'string') return raw['Message'] as string;
  return '';
}

/** Cognito nunca debe revelar si un correo existe (criterio de aceptación 3):
 * `UserNotFoundException` y `NotAuthorizedException` "genéricas" se mapean al
 * mismo mensaje de credenciales inválidas. */
function mapCognitoError(payload: unknown): CognitoAuthError {
  const errorType = extractErrorType(payload);
  const message = extractErrorMessage(payload);

  switch (errorType) {
    case 'NotAuthorizedException':
      if (/attempt/i.test(message) || /too many/i.test(message)) {
        return new CognitoAuthError(
          'TOO_MANY_ATTEMPTS',
          'Se bloqueó el inicio de sesión temporalmente por demasiados intentos fallidos. Intenta de nuevo en unos minutos.',
        );
      }
      return new CognitoAuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    case 'UserNotFoundException':
      return new CognitoAuthError('INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    case 'UserNotConfirmedException':
      return new CognitoAuthError(
        'USER_NOT_CONFIRMED',
        'Tu cuenta todavía no está activada. Actívala con tu DNI o verifica tu correo antes de iniciar sesión.',
      );
    case 'PasswordResetRequiredException':
      return new CognitoAuthError(
        'PASSWORD_RESET_REQUIRED',
        'Debes restablecer tu contraseña antes de continuar.',
      );
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
    case 'LimitExceededException':
      return new CognitoAuthError(
        'TOO_MANY_ATTEMPTS',
        'Se bloqueó el inicio de sesión temporalmente por demasiados intentos. Intenta de nuevo en unos minutos.',
      );
    default:
      return new CognitoAuthError('UNKNOWN', 'No se pudo iniciar sesión. Intenta nuevamente.');
  }
}

/** Errores de `ForgotPassword` (US-015). `UserNotFoundException` se mapea a
 * `ACCOUNT_NOT_FOUND`, que `requestPasswordReset` resuelve como éxito
 * silencioso: la interfaz nunca debe distinguir un correo inexistente
 * (criterio de aceptación 2). */
function mapForgotPasswordError(payload: unknown): CognitoAuthError {
  const errorType = extractErrorType(payload);

  switch (errorType) {
    case 'UserNotFoundException':
      return new CognitoAuthError('ACCOUNT_NOT_FOUND', 'Cuenta no encontrada.');
    case 'TooManyRequestsException':
    case 'LimitExceededException':
      return new CognitoAuthError(
        'TOO_MANY_ATTEMPTS',
        'Alcanzaste el límite de solicitudes de recuperación. Intenta de nuevo en unos minutos.',
      );
    default:
      return new CognitoAuthError(
        'UNKNOWN',
        'No se pudo procesar la solicitud. Intenta nuevamente.',
      );
  }
}

/** Errores de `ConfirmForgotPassword` (US-015). `CodeMismatchException`,
 * `ExpiredCodeException` y `UserNotFoundException` se agrupan en el mismo
 * mensaje de código inválido/vencido (criterio de aceptación 4): distinguir
 * un correo inexistente en este paso también revelaría su existencia. */
function mapConfirmForgotPasswordError(payload: unknown): CognitoAuthError {
  const errorType = extractErrorType(payload);
  const message = extractErrorMessage(payload);

  switch (errorType) {
    case 'CodeMismatchException':
    case 'ExpiredCodeException':
    case 'UserNotFoundException':
      return new CognitoAuthError(
        'INVALID_RESET_CODE',
        'El código ingresado no es válido o venció. Solicita uno nuevo e inténtalo de nuevo.',
      );
    case 'InvalidPasswordException':
      return new CognitoAuthError(
        'WEAK_PASSWORD',
        message || 'La nueva contraseña no cumple los requisitos de seguridad.',
      );
    case 'TooManyRequestsException':
    case 'LimitExceededException':
    case 'TooManyFailedAttemptsException':
      return new CognitoAuthError(
        'TOO_MANY_ATTEMPTS',
        'Se bloqueó temporalmente por demasiados intentos. Intenta de nuevo en unos minutos.',
      );
    default:
      return new CognitoAuthError(
        'UNKNOWN',
        'No se pudo actualizar la contraseña. Intenta nuevamente.',
      );
  }
}

function toTokens(result: AuthenticationResultPayload): CognitoTokens {
  return {
    idToken: result.IdToken,
    accessToken: result.AccessToken,
    ...(result.RefreshToken !== undefined ? { refreshToken: result.RefreshToken } : {}),
    expiresIn: result.ExpiresIn,
  };
}

/** Login con correo y contraseña (RN-ACT-04). Las credenciales viajan solo en
 * el cuerpo de esta petición: nunca se registran en logs ni se persisten
 * (criterio de aceptación 7). */
export async function initiateUserPasswordAuth(
  email: string,
  password: string,
): Promise<CognitoTokens> {
  const { clientId } = readConfig();
  const response = await callCognitoIdp<InitiateAuthResponsePayload>('InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: clientId,
    AuthParameters: { USERNAME: email, PASSWORD: password },
  });

  if (!response.AuthenticationResult) {
    // Cognito puede solicitar un challenge adicional (p. ej. contraseña
    // temporal sin cambiar). Ningún challenge está contemplado en el alcance
    // de US-014.
    throw new CognitoAuthError(
      'UNKNOWN',
      'Tu cuenta requiere un paso adicional que todavía no está disponible. Contacta al club.',
    );
  }

  return toTokens(response.AuthenticationResult);
}

/** Renueva la sesión sin volver a pedir credenciales (criterio de
 * aceptación 4), mientras el refresh token siga vigente. */
export async function initiateRefreshTokenAuth(refreshToken: string): Promise<CognitoTokens> {
  const { clientId } = readConfig();
  const response = await callCognitoIdp<InitiateAuthResponsePayload>('InitiateAuth', {
    AuthFlow: 'REFRESH_TOKEN_AUTH',
    ClientId: clientId,
    AuthParameters: { REFRESH_TOKEN: refreshToken },
  });

  if (!response.AuthenticationResult) {
    throw new CognitoAuthError('UNKNOWN', 'No se pudo renovar la sesión.');
  }

  return { ...toTokens(response.AuthenticationResult), refreshToken };
}

/** Cierre de sesión (criterio de aceptación 5): revoca los tokens del lado de
 * Cognito. Es best-effort — si falla (p. ej. el access token ya venció), el
 * llamador igual descarta los tokens localmente. */
export async function globalSignOut(accessToken: string): Promise<void> {
  await callCognitoIdp('GlobalSignOut', { AccessToken: accessToken });
}

/** Solicita el código de recuperación de contraseña (US-015, criterio de
 * aceptación 1). Nunca rechaza por cuenta inexistente: Cognito solo entrega
 * el código si la cuenta existe, pero la promesa se resuelve igual en ambos
 * casos para no revelar si el correo está registrado (criterio de
 * aceptación 2). */
export async function requestPasswordReset(email: string): Promise<void> {
  const { clientId } = readConfig();
  try {
    await callCognitoIdp(
      'ForgotPassword',
      { ClientId: clientId, Username: email },
      mapForgotPasswordError,
    );
  } catch (error) {
    if (error instanceof CognitoAuthError && error.reason === 'ACCOUNT_NOT_FOUND') {
      return;
    }
    throw error;
  }
}

/** Confirma el código de recuperación y establece la nueva contraseña
 * (US-015, criterio de aceptación 3). La contraseña solo viaja en el cuerpo
 * de esta petición hacia Cognito: nunca se registra en logs ni se persiste
 * en el cliente (criterio de aceptación 6). */
export async function confirmPasswordReset(
  email: string,
  confirmationCode: string,
  newPassword: string,
): Promise<void> {
  const { clientId } = readConfig();
  await callCognitoIdp(
    'ConfirmForgotPassword',
    {
      ClientId: clientId,
      Username: email,
      ConfirmationCode: confirmationCode,
      Password: newPassword,
    },
    mapConfirmForgotPasswordError,
  );
}
