// Alta del usuario Cognito de un socio nuevo (RN-ACT-05, ADR-0002, grupo
// `member`). Usa la Admin API server-side (nunca credenciales de usuario
// final) para crear la cuenta con **contraseña definitiva**: el socio debe
// poder iniciar sesión de inmediato (US-014, correo+contraseña) sin pasar
// por el reto `NEW_PASSWORD_REQUIRED`.
//
// `AdminCreateUser` por sí solo deja al usuario en estado
// `FORCE_CHANGE_PASSWORD` (contraseña temporal). Por eso se completa con
// `AdminSetUserPassword` (`Permanent: true`), que confirma la contraseña
// elegida por el socio como definitiva. La contraseña nunca se registra en
// logs (ver ../lib/logger.ts) ni se persiste en DynamoDB (RN-SEC).

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

export interface CreateMemberCognitoUserInput {
  /** Correo ya normalizado (minúsculas); es el username del User Pool (username_attributes=["email"]). */
  email: string;
  password: string;
}

export type CreateMemberCognitoUser = (input: CreateMemberCognitoUserInput) => Promise<string>;

/**
 * Crea el usuario Cognito del socio nuevo: `AdminCreateUser` (sin correo de
 * bienvenida propio de Cognito; las notificaciones del club se envían por
 * SES) + `AdminSetUserPassword` (contraseña definitiva) + `AdminAddUserToGroup`
 * (grupo `member`). Devuelve el `sub` de Cognito para enlazar el `Member`
 * (`cognitoSub`, GSI1).
 */
export const createMemberCognitoUser: CreateMemberCognitoUser = async (input) => {
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
      // registros concurrentes con el mismo correo no pueden crear dos
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
