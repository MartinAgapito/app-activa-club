// Resolución de la llave secreta de cobro de Stripe test mode (`sk_test_...`,
// ADR-0011 §D1/§D2, RN-PAG-08). Es un secreto **distinto** del signing secret
// del webhook (`./webhook-secret.ts`): esta llave solo sirve para crear
// `PaymentIntent`s server-side, nunca para verificar la autenticidad de una
// notificación entrante. Ver
// `infrastructure/terraform/environments/dev/main.tf`,
// `aws_ssm_parameter.stripe_secret_key`.
//
// Se lee de SSM Parameter Store (`SecureString`, `WithDecryption: true`) vía
// `ssm:GetParameter`, con el mismo patrón que el resto del backend evita
// texto plano en el repo. Se cachea en memoria del proceso (reutilizado entre
// invocaciones cálidas de la misma Lambda, igual que `./webhook-secret.ts` y
// `getDocumentClient` en `../lib/dynamo.ts`) para no pagar una llamada a SSM
// en cada invocación. **Nunca** se loguea este valor (RN-PAG-08, criterio 11).

import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

import { optionalEnv, requireEnv } from '../lib/env';

let ssmClientSingleton: SSMClient | undefined;
let cachedSecretKey: string | undefined;

function getSsmClient(): SSMClient {
  const region = optionalEnv('AWS_REGION');
  ssmClientSingleton ??= new SSMClient(region ? { region } : {});
  return ssmClientSingleton;
}

/**
 * Devuelve la llave secreta de Stripe, leída de SSM (`STRIPE_SECRET_KEY_PARAM_NAME`)
 * la primera vez que se necesita en cada instancia cálida de la Lambda.
 */
export async function getStripeSecretKey(client: SSMClient = getSsmClient()): Promise<string> {
  if (cachedSecretKey !== undefined) return cachedSecretKey;

  const paramName = requireEnv('STRIPE_SECRET_KEY_PARAM_NAME');
  const result = await client.send(
    new GetParameterCommand({ Name: paramName, WithDecryption: true }),
  );
  const value = result.Parameter?.Value;
  if (!value) {
    throw new Error('La llave secreta de Stripe no está configurada.');
  }

  cachedSecretKey = value;
  return cachedSecretKey;
}

/** Solo para pruebas: limpia la llave cacheada entre casos (evita fugas de estado entre tests). */
export function resetStripeSecretKeyCacheForTests(): void {
  cachedSecretKey = undefined;
}
