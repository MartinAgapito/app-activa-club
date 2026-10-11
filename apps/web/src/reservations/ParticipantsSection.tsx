// Participantes de la reserva (US-032, criterios 4 y 5).
//
// El titular agrega acompañantes buscándolos por DNI: socios con
// `GET /members/lookup` (el `memberId` viene del servidor, nunca se escribe) e
// invitados externos con `GET /guests/lookup` (404 = invitado nuevo, se pide
// nombre y apellido; si ya existe se muestra el nombre registrado sin
// permitir renombrarlo). El aforo se anticipa aquí, pero decide el servidor.

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Badge, Button, Card, CardHeader, Input } from '@activa-club/ui';
import { memberLookupQuerySchema } from '@activa-club/validation';
import { ApiRequestError } from '../lib/api/http-client';
import {
  capacityLimitMessage,
  guestNameFormSchema,
  maxCompanions,
  participantFullName,
  participantKey,
  validateAddition,
  type AdditionContext,
  type DraftParticipant,
  type GuestNameFormValues,
} from './participants';
import { lookupGuestByDni, lookupMemberByDni } from './reservations-client';
import { toLookupErrorMessage } from './reservation-errors';

type ParticipantKind = 'MEMBER' | 'GUEST';

type LookupResult =
  | { kind: 'member'; dni: string; memberId: string; firstName: string; lastName: string }
  | { kind: 'member-not-found'; dni: string }
  | { kind: 'guest-existing'; dni: string; firstName: string; lastName: string }
  | { kind: 'guest-new'; dni: string };

interface DniFormValues {
  dni: string;
}

export interface ParticipantsSectionProps {
  resourceName: string;
  capacity: number;
  participants: DraftParticipant[];
  holderMemberId: string | null;
  holderDni: string | null;
  onAdd: (participant: DraftParticipant) => void;
  onRemove: (key: string) => void;
}

export function ParticipantsSection({
  resourceName,
  capacity,
  participants,
  holderMemberId,
  holderDni,
  onAdd,
  onRemove,
}: ParticipantsSectionProps) {
  const companionLimit = maxCompanions(capacity);
  const isFull = participants.length >= companionLimit;

  return (
    <Card>
      <CardHeader
        title="Participantes"
        description={`${capacityLimitMessage(resourceName, capacity)} Llevas ${participants.length} de ${companionLimit}.`}
      />

      {participants.length === 0 ? (
        <p className="mb-4 text-sm text-slate-600">
          Aún no agregaste acompañantes. Es opcional: puedes reservar solo.
        </p>
      ) : (
        <ul className="mb-4 flex flex-col gap-2" aria-label="Participantes agregados">
          {participants.map((participant) => (
            <li
              key={participantKey(participant)}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-900">
                  {participantFullName(participant)}
                </span>
                <Badge variant={participant.type === 'MEMBER' ? 'info' : 'neutral'}>
                  {participant.type === 'MEMBER' ? 'Socio' : 'Invitado externo'}
                </Badge>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={`Quitar a ${participantFullName(participant)}`}
                onClick={() => onRemove(participantKey(participant))}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      {isFull ? (
        <p
          role="status"
          className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-800"
        >
          Alcanzaste el aforo de la instalación. Quita a alguien si quieres agregar a otra persona.
        </p>
      ) : (
        <AddParticipantPanel
          context={{ participants, capacity, holderMemberId, holderDni }}
          onAdd={onAdd}
        />
      )}
    </Card>
  );
}

interface AddParticipantPanelProps {
  context: AdditionContext;
  onAdd: (participant: DraftParticipant) => void;
}

function AddParticipantPanel({ context, onAdd }: AddParticipantPanelProps) {
  const [kind, setKind] = useState<ParticipantKind>('MEMBER');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<DniFormValues>({
    resolver: zodResolver(memberLookupQuerySchema),
    defaultValues: { dni: '' },
  });

  // El resultado solo es válido para el DNI con el que se buscó.
  const currentDni = (useWatch({ control, name: 'dni' }) ?? '').trim();
  const visibleResult = result && result.dni === currentDni ? result : null;

  function changeKind(next: ParticipantKind) {
    setKind(next);
    setResult(null);
    setMessage(null);
  }

  async function search(dni: string, searchKind: ParticipantKind) {
    setIsSearching(true);
    setMessage(null);
    setResult(null);
    try {
      if (searchKind === 'MEMBER') {
        if (dni === context.holderDni) {
          setMessage('Ese DNI es el tuyo: ya participas como titular de la reserva.');
          return;
        }
        try {
          const member = await lookupMemberByDni(dni);
          setResult({ kind: 'member', dni, ...member });
        } catch (error) {
          if (error instanceof ApiRequestError && error.code === 'DNI_NOT_FOUND') {
            setResult({ kind: 'member-not-found', dni });
          } else {
            throw error;
          }
        }
      } else {
        const guest = await lookupGuestByDni(dni);
        setResult(
          guest
            ? {
                kind: 'guest-existing',
                dni,
                firstName: guest.firstName,
                lastName: guest.lastName,
              }
            : { kind: 'guest-new', dni },
        );
      }
    } catch (error) {
      setMessage(toLookupErrorMessage(error));
    } finally {
      setIsSearching(false);
    }
  }

  const onSubmit = handleSubmit((values) => search(values.dni, kind));

  function tryAdd(participant: DraftParticipant) {
    const problem = validateAddition(participant, context);
    if (problem) {
      setMessage(problem);
      return;
    }
    onAdd(participant);
    setResult(null);
    setMessage(null);
    reset({ dni: '' });
  }

  function switchToGuest(dni: string) {
    setKind('GUEST');
    void search(dni, 'GUEST');
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-slate-700">Agregar participante</legend>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="participant-kind"
              checked={kind === 'MEMBER'}
              onChange={() => changeKind('MEMBER')}
            />
            Otro socio
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="participant-kind"
              checked={kind === 'GUEST'}
              onChange={() => changeKind('GUEST')}
            />
            Invitado externo
          </label>
        </div>
      </fieldset>

      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(event) => void onSubmit(event)}
        noValidate
      >
        <div className="flex-1">
          <Input
            label={kind === 'MEMBER' ? 'DNI del socio' : 'DNI del invitado'}
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            helpText="8 dígitos. Buscamos por DNI exacto."
            errorMessage={errors.dni?.message}
            {...register('dni')}
          />
        </div>
        <Button type="submit" variant="secondary" isLoading={isSearching}>
          Buscar
        </Button>
      </form>

      {message ? (
        <p role="alert" className="text-sm text-danger-700">
          {message}
        </p>
      ) : null}

      {visibleResult?.kind === 'member' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-positive-200 bg-white p-3">
          <p className="text-sm text-slate-700">
            Encontramos al socio{' '}
            <strong className="text-slate-900">
              {visibleResult.firstName} {visibleResult.lastName}
            </strong>
            . Confirma que es la persona que quieres agregar.
          </p>
          <Button
            type="button"
            variant="positive"
            onClick={() =>
              tryAdd({
                type: 'MEMBER',
                memberId: visibleResult.memberId,
                firstName: visibleResult.firstName,
                lastName: visibleResult.lastName,
              })
            }
          >
            {`Agregar a ${visibleResult.firstName} ${visibleResult.lastName}`}
          </Button>
        </div>
      ) : null}

      {visibleResult?.kind === 'member-not-found' ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-lg border border-warning-200 bg-warning-50 p-3"
        >
          <p className="text-sm text-warning-900">
            Ese DNI no figura como socio del club. Si es una persona externa, puedes agregarla como
            invitado.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => switchToGuest(visibleResult.dni)}
          >
            Agregar como invitado externo
          </Button>
        </div>
      ) : null}

      {visibleResult?.kind === 'guest-existing' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-positive-200 bg-white p-3">
          <p className="text-sm text-slate-700">
            Invitado registrado:{' '}
            <strong className="text-slate-900">
              {visibleResult.firstName} {visibleResult.lastName}
            </strong>
            . El nombre registrado no se puede modificar.
          </p>
          <Button
            type="button"
            variant="positive"
            onClick={() =>
              tryAdd({
                type: 'GUEST',
                dni: visibleResult.dni,
                firstName: visibleResult.firstName,
                lastName: visibleResult.lastName,
                registered: true,
              })
            }
          >
            {`Agregar a ${visibleResult.firstName} ${visibleResult.lastName}`}
          </Button>
        </div>
      ) : null}

      {visibleResult?.kind === 'guest-new' ? (
        <NewGuestForm
          key={visibleResult.dni}
          dni={visibleResult.dni}
          onSubmit={(values) =>
            tryAdd({
              type: 'GUEST',
              dni: visibleResult.dni,
              firstName: values.firstName,
              lastName: values.lastName,
              registered: false,
            })
          }
        />
      ) : null}
    </div>
  );
}

interface NewGuestFormProps {
  dni: string;
  onSubmit: (values: GuestNameFormValues) => void;
}

function NewGuestForm({ dni, onSubmit }: NewGuestFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GuestNameFormValues>({
    resolver: zodResolver(guestNameFormSchema),
    defaultValues: { firstName: '', lastName: '' },
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3"
      onSubmit={(event) => {
        // Evita que el submit burbujee a un formulario padre.
        event.stopPropagation();
        void handleSubmit(onSubmit)(event);
      }}
      noValidate
      aria-label={`Datos del invitado con DNI ${dni}`}
    >
      <p className="text-sm text-slate-700">
        Es la primera vez que invitas a esta persona. Ingresa su nombre y apellido para registrarla.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Nombre del invitado"
          autoComplete="off"
          errorMessage={errors.firstName?.message}
          {...register('firstName')}
        />
        <Input
          label="Apellido del invitado"
          autoComplete="off"
          errorMessage={errors.lastName?.message}
          {...register('lastName')}
        />
      </div>
      <Button type="submit" variant="positive">
        Agregar invitado
      </Button>
    </form>
  );
}
