// Orquestador de `GET /guests/lookup?dni=` (US-031, docs/api/contratos-api.md
// §7, RN-RES-03/04, ADR-0009): resuelve el perfil de un invitado externo ya
// registrado por DNI exacto, para que el titular lo reutilice sin retipear su
// nombre. Sin efectos de lado; un `GuestProfile` inexistente **no** es un
// error de negocio, es la señal de que la interfaz debe pedir nombre y
// apellido para darlo de alta al confirmar la reserva (`POST /reservations`).
//
// Un único `GetItem` puntual (nunca `Query`/`Scan`, ADR-0009):
// `GUEST#<dni>`/`PROFILE` (§3.15, patrón de acceso #24), proyectando solo
// `guestDni`/`firstName`/`lastName` — nunca el `GuestMonthlyCounter` hermano
// de la misma partición (revelaría cuántas visitas lleva con otros socios).

import { GetCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { GuestLookupResponse } from '@activa-club/shared-types';

import { getDocumentClient, keys, tableName } from '../lib/dynamo';
import { AppError } from '../lib/errors';

export interface LookupGuestByDniInput {
  dni: string;
  /** Cliente DynamoDB inyectable; por defecto el singleton compartido (lib/dynamo). */
  client?: DynamoDBDocumentClient;
}

interface GuestProfileProjectionItem {
  guestDni: string;
  firstName: string;
  lastName: string;
}

/** Resuelve el perfil de un invitado externo por DNI exacto. 404 `NOT_FOUND` si nunca fue invitado (criterio 15 de US-031). */
export async function lookupGuestByDni(input: LookupGuestByDniInput): Promise<GuestLookupResponse> {
  const client = input.client ?? getDocumentClient();
  const dni = input.dni.trim();

  const result = await client.send(
    new GetCommand({ TableName: tableName(), Key: keys.guestProfile(dni) }),
  );
  const profile = result.Item as GuestProfileProjectionItem | undefined;
  if (!profile) {
    throw new AppError('NOT_FOUND', 'Este DNI todavía no fue invitado.');
  }

  return {
    guestDni: profile.guestDni,
    firstName: profile.firstName,
    lastName: profile.lastName,
  };
}
