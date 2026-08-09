// Resolución del secreto de verificación de firma del webhook de Culqi
// (US-024, criterio 2/7; ADR-0007). Es un secreto **distinto** de la llave
// privada de cobro (`aws_ssm_parameter.culqi_private_key`, US-019): solo
// sirve para validar la autenticidad de las notificaciones entrantes de
// Culqi, nunca para cobrar. Ver
// `infrastructure/terraform/environments/dev/main.tf`,
// `aws_ssm_parameter.culqi_webhook_secret`.
//
// Se lee de SSM Parameter Store (`SecureString`, `WithDecryption: true`) vía
// `ssm:GetParameter`, con el mismo patrón que el resto del backend evita
// texto plano en el repo. Se cachea en memoria del proceso (reutilizado entre
// invocaciones cálidas de la misma Lambda, igual que `getDocumentClient` en
// `../lib/dynamo.ts`) para no pagar una llamada a SSM en cada invocación del
// webhook. **Nunca** se loguea este valor (RN-PAG-08, criterio 7).

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import { optionalEnv, requireEnv } from '../lib/env';

let ssmClientSingleton: SSMClient | undefined;
let cachedSecret: string | undefined;

function getSsmClient(): SSMClient {
  const region = optionalEnv('AWS_REGION');
  ssmClientSingleton ??= new SSMClient(region ? { region } : {});
  return ssmClientSingleton;
}

/**
 * Devuelve el secreto compartido de verificación del webhook de Culqi, leído
 * de SSM (`CULQI_WEBHOOK_SECRET_PARAM_NAME`) la primera vez que se necesita
 * en cada instancia cálida de la Lambda.
 */
export async function getCulqiWebhookSecret(client: SSMClient = getSsmClient()): Promise<string> {
  if (cachedSecret !== undefined) return cachedSecret;

  const paramName = requireEnv('CULQI_WEBHOOK_SECRET_PARAM_NAME');
  const result = await client.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error('El secreto de verificación del webhook de Culqi no está configurado.');
  }

  cachedSecret = value;
  return cachedSecret;
}

/** Solo para pruebas: limpia el secreto cacheado entre casos (evita fugas de estado entre tests). */
export function resetCulqiWebhookSecretCacheForTests(): void {
  cachedSecret = undefined;
}
