// Resolución del signing secret de verificación del webhook de Stripe
// (US-024/US-037, criterio 2/7/8; ADR-0011 §D6). Es un secreto **distinto**
// de la llave secreta de cobro (`aws_ssm_parameter.stripe_secret_key`,
// `./stripe-secret-key.ts`): solo sirve para que
// `stripe.webhooks.constructEvent` valide la autenticidad de las
// notificaciones entrantes de Stripe, nunca para cobrar. Ver
// `infrastructure/terraform/environments/dev/main.tf`,
// `aws_ssm_parameter.stripe_webhook_signing_secret`.
//
// Se lee de SSM Parameter Store (`SecureString`, `WithDecryption: true`) vía
// `ssm:GetParameter`, con el mismo patrón que el resto del backend evita
// texto plano en el repo. Se cachea en memoria del proceso (reutilizado entre
// invocaciones cálidas de la misma Lambda, igual que `getDocumentClient` en
// `../lib/dynamo.ts`) para no pagar una llamada a SSM en cada invocación del
// webhook. **Nunca** se loguea este valor (RN-PAG-08, criterio 11).

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
 * Devuelve el signing secret (`whsec_...`) de verificación del webhook de
 * Stripe, leído de SSM (`STRIPE_WEBHOOK_SECRET_PARAM_NAME`) la primera vez
 * que se necesita en cada instancia cálida de la Lambda.
 */
export async function getStripeWebhookSecret(client: SSMClient = getSsmClient()): Promise<string> {
  if (cachedSecret !== undefined) return cachedSecret;

  const paramName = requireEnv('STRIPE_WEBHOOK_SECRET_PARAM_NAME');
  const result = await client.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error('El signing secret del webhook de Stripe no está configurado.');
  }

  cachedSecret = value;
  return cachedSecret;
}

/** Solo para pruebas: limpia el secreto cacheado entre casos (evita fugas de estado entre tests). */
export function resetStripeWebhookSecretCacheForTests(): void {
  cachedSecret = undefined;
}
