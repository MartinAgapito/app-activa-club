// Selección de un socio por DNI para el segmento `SINGLE` (US-049, criterio 4).
//
// `GET /members/lookup?dni=` devuelve solo identificador y nombre: el nombre
// se muestra para que el administrador confirme a quién va dirigido el aviso
// antes de publicar. Enter en el campo busca (no envía el formulario).

import { useId, useState, type KeyboardEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Input } from '@activa-club/ui';
import { dniSchema } from '@activa-club/validation';
import { lookupMemberByDni } from '../../reservations/reservations-client';
import { toLookupMessage } from './notification-errors';

export interface ResolvedMember {
  memberId: string;
  name: string;
}

interface SingleMemberFieldProps {
  member: ResolvedMember | null;
  onChange: (member: ResolvedMember | null) => void;
  /** Error del formulario (falta confirmar al socio). */
  errorMessage?: string | undefined;
}

export function SingleMemberField({ member, onChange, errorMessage }: SingleMemberFieldProps) {
  const [dni, setDni] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const confirmedId = useId();

  const mutation = useMutation({
    mutationFn: (value: string) => lookupMemberByDni(value),
    onSuccess: (result) => {
      setLookupError(null);
      onChange({ memberId: result.memberId, name: `${result.firstName} ${result.lastName}` });
    },
    onError: (error: unknown) => setLookupError(toLookupMessage(error)),
  });

  function search() {
    if (mutation.isPending) {
      return;
    }
    const parsed = dniSchema.safeParse(dni);
    if (!parsed.success) {
      setLookupError('El DNI debe tener 8 dígitos.');
      return;
    }
    setLookupError(null);
    mutation.mutate(parsed.data);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      search();
    }
  }

  if (member) {
    return (
      <div className="flex flex-col gap-2 rounded-control border border-line bg-surface-raised p-3 sm:flex-row sm:items-center sm:justify-between">
        <p id={confirmedId} className="text-sm text-ink">
          <span className="text-ink-muted">Socio seleccionado: </span>
          <span className="font-semibold">{member.name}</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          aria-describedby={confirmedId}
          onClick={() => {
            setDni('');
            onChange(null);
          }}
        >
          Cambiar socio
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="sm:w-72">
        <Input
          label="DNI del socio"
          required
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          placeholder="8 dígitos"
          value={dni}
          onChange={(event) => {
            setDni(event.target.value);
            setLookupError(null);
          }}
          onKeyDown={handleKeyDown}
          errorMessage={lookupError ?? errorMessage}
        />
      </div>
      <Button
        type="button"
        variant="secondary"
        className="sm:mt-[1.625rem]"
        isLoading={mutation.isPending}
        onClick={search}
      >
        Buscar socio
      </Button>
    </div>
  );
}
