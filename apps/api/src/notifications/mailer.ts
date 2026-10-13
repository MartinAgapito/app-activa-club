// Envío de correo transaccional por Amazon SES (ADR-0006, US-040).
//
// Se usa la API v2 `SendEmail` con contenido "Simple" (asunto y cuerpo armados
// en código, sin plantillas SES): solo requiere `ses:SendEmail`, que es el
// único permiso concedido a las Lambdas emisoras (US-039). Ver el PR de US-040
// para la justificación del desvío respecto de "plantillas SES en Terraform".

import { SESv2Client, SendEmailCommand, type SESv2ClientConfig } from '@aws-sdk/client-sesv2';

import { optionalEnv } from '../lib/env';

/** Contrato mínimo de envío; permite inyectar un doble en las pruebas. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let sesClient: SESv2Client | undefined;

function clientConfig(): SESv2ClientConfig {
  const region = optionalEnv('AWS_REGION');
  return region ? { region } : {};
}

/** Cliente SES reutilizado entre invocaciones (fuera del handler). */
function getSesClient(): SESv2Client {
  sesClient ??= new SESv2Client(clientConfig());
  return sesClient;
}

/** Remitente verificado del ambiente (`SES_SENDER_EMAIL`); `undefined` si no está configurado. */
export function getSenderEmail(): string | undefined {
  const value = optionalEnv('SES_SENDER_EMAIL');
  return value === undefined || value === '' ? undefined : value;
}

/** Nombre visible del remitente en las bandejas de correo. */
export const SENDER_DISPLAY_NAME = 'Activa Club';

/**
 * Cabecera From con nombre visible (RFC 5322): `Activa Club <dir>`. El nombre
 * se entrecomilla si contiene caracteres especiales. La condición IAM
 * `ses:FromAddress` compara solo la dirección, no el nombre. Si el valor
 * configurado ya trae `<...>` se respeta tal cual.
 */
export function formatFromAddress(address: string, displayName = SENDER_DISPLAY_NAME): string {
  if (address.includes('<')) return address;
  const needsQuotes = /[^A-Za-z0-9 !#$%&'*+/=?^_`{|}~-]/.test(displayName);
  const name = needsQuotes ? `"${displayName.replace(/(["\\])/g, '\\$1')}"` : displayName;
  return `${name} <${address}>`;
}

/** Implementación real sobre SES. Lanza ante cualquier error del servicio. */
export function createSesEmailSender(sender: string): EmailSender {
  return {
    async send(message: EmailMessage): Promise<void> {
      await getSesClient().send(
        new SendEmailCommand({
          FromEmailAddress: formatFromAddress(sender),
          Destination: { ToAddresses: [message.to] },
          Content: {
            Simple: {
              Subject: { Data: message.subject, Charset: 'UTF-8' },
              Body: {
                Text: { Data: message.text, Charset: 'UTF-8' },
                Html: { Data: message.html, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
    },
  };
}
