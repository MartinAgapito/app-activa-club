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

/** Implementación real sobre SES. Lanza ante cualquier error del servicio. */
export function createSesEmailSender(sender: string): EmailSender {
  return {
    async send(message: EmailMessage): Promise<void> {
      await getSesClient().send(
        new SendEmailCommand({
          FromEmailAddress: sender,
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
