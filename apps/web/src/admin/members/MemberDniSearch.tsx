// Búsqueda de un socio por DNI exacto (US-051, ADR-0009).
//
// `GET /members/lookup?dni=` devuelve 404 `DNI_NOT_FOUND` tanto si no existe
// como si el socio está `PENDING` o `REJECTED`; la pantalla lo explica y
// sugiere revisar esas pestañas. No hay búsqueda por nombre ni correo.

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Button, Input } from '@activa-club/ui';
import { dniSchema } from '@activa-club/validation';
import { ApiRequestError } from '../../lib/api/http-client';
import { lookupMemberByDni } from '../../reservations/reservations-client';

const searchSchema = z.object({ dni: dniSchema });
type SearchValues = z.infer<typeof searchSchema>;

const NOT_FOUND_MESSAGE =
  'No encontramos un socio con ese DNI. Si es una solicitud nueva o rechazada, revísala en las pestañas "Pendientes" o "Rechazados".';

interface MemberDniSearchProps {
  onFound: (memberId: string) => void;
}

export function MemberDniSearch({ onFound }: MemberDniSearchProps) {
  const [errorText, setErrorText] = useState<string | null>(null);
  const form = useForm<SearchValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: { dni: '' },
  });

  const mutation = useMutation({
    mutationFn: (values: SearchValues) => lookupMemberByDni(values.dni),
    onSuccess: (result) => {
      setErrorText(null);
      onFound(result.memberId);
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === 'DNI_NOT_FOUND') {
        setErrorText(NOT_FOUND_MESSAGE);
      } else {
        setErrorText(
          error instanceof ApiRequestError
            ? error.message
            : 'No se pudo realizar la búsqueda. Intenta nuevamente.',
        );
      }
    },
  });

  return (
    <form
      noValidate
      role="search"
      aria-label="Buscar socio por DNI"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        setErrorText(null);
        void form.handleSubmit((values) => mutation.mutate(values))(event);
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-72">
          <Input
            label="Buscar por DNI"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            placeholder="8 dígitos"
            errorMessage={form.formState.errors.dni?.message}
            {...form.register('dni')}
          />
        </div>
        <Button type="submit" isLoading={mutation.isPending}>
          Buscar
        </Button>
      </div>
      {errorText ? (
        <p role="alert" className="text-sm text-status-problem">
          {errorText}
        </p>
      ) : null}
    </form>
  );
}
