// Alta del usuario Cognito de un socio migrado que activa su cuenta (RN-ACT-01/04,
// ADR-0002, grupo `member`). Mismo patrón que `../registration/cognito.ts`
// (Admin API server-side, nunca credenciales de usuario final): la
// contraseña elegida por el socio se confirma como **definitiva** con
// `AdminSetUserPassword` (`Permanent: true`) para que pueda iniciar sesión de
// inmediato (US-014, correo+contraseña) sin el reto
// `NEW_PASSWORD_REQUIRED` que deja `AdminCreateUser` por sí solo.
//
// La contraseña nunca se registra en logs (ver ../lib/logger.ts) ni se
// persiste en DynamoDB (RN-SEC).

import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';

import { optionalEnv, requireEnv } from '../lib/env';
import { AppError } from '../lib/errors';

const MEMBER_GROUP = 'member';

let cognitoClient: CognitoIdentityProviderClient | undefined;

function getCognitoClient(): CognitoIdentityProviderClient {
  const region = optionalEnv('AWS_REGION');
  cognitoClient ??= new CognitoIdentityProviderClient(region ? { region } : {});
  return cognitoClient;
}

/** ID del User Pool único de Activa Club (ADR-0002). */
function getUserPoolId(): string {
  return requireEnv('COGNITO_USER_POOL_ID');
}

export interface CreateActivationCognitoUserInput {
  /** Correo ya normalizado (minúsculas); es el username del User Pool (username_attributes=["email"]). */
  email: string;
  password: string;
}

export type CreateActivationCognitoUser = (
  input: CreateActivationCognitoUserInput,
) => Promise<string>;

/**
 * Crea el usuario Cognito del socio migrado que activa su cuenta:
 * `AdminCreateUser` (sin correo de bienvenida propio de Cognito; las
 * notificaciones del club se envían por SES) + `AdminSetUserPassword`
 * (contraseña definitiva) + `AdminAddUserToGroup` (grupo `member`). Devuelve
 * el `sub` de Cognito para enlazar el `Member` migrado (`cognitoSub`, GSI1).
 */
export const createActivationCognitoUser: CreateActivationCognitoUser = async (input) => {
  const client = getCognitoClient();
  const userPoolId = getUserPoolId();

  let cognitoSub: string | undefined;
  try {
    const created = await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: input.email,
        UserAttributes: [
          { Name: 'email', Value: input.email },
          { Name: 'email_verified', Value: 'true' },
        ],
        MessageAction: 'SUPPRESS',
      }),
    );
    cognitoSub = created.User?.Attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
  } catch (error) {
    if (error instanceof Error && error.name === 'UsernameExistsException') {
      // Red de seguridad además de la verificación previa en DynamoDB: dos
      // activaciones concurrentes con el mismo correo no pueden crear dos
      // usuarios Cognito (el username es único en el User Pool).
      throw new AppError('EMAIL_ALREADY_USED', 'Ya existe una cuenta con este correo.');
    }
    throw error;
  }

  if (!cognitoSub) {
    throw new AppError('INTERNAL_ERROR', 'No se pudo crear la cuenta de acceso del socio.');
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: input.email,
      Password: input.password,
      Permanent: true,
    }),
  );

  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: input.email,
      GroupName: MEMBER_GROUP,
    }),
  );

  return cognitoSub;
};
