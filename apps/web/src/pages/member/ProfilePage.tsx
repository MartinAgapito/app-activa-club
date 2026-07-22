// Mi perfil — US-018.
//
// Consulta el perfil propio del socio autenticado (`GET /members/me`) y
// permite actualizar su teléfono de contacto (`PATCH /members/me`,
// docs/api/contratos-api.md §4). El DNI y el correo de identidad son de solo
// lectura (RN-ACT-02/03); el estado de socio y de membresía también son de
// solo lectura y se muestran traducidos a texto claro (nunca el código
// interno crudo), vía lib/format/member-status.ts.
//
// Un socio `MIGRATED`/`PENDING` puede ver su perfil igual que uno `ACTIVE`:
// esta pantalla no bloquea la vista por estado (caso alternativo de US-018).

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ErrorState,
  Input,
  PageHeader,
  Spinner,
} from '@activa-club/ui';
import type { Member } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { fetchMemberProfile, updateMemberProfile } from '../../members/profile-client';
import {
  profileContactFormSchema,
  type ProfileContactFormValues,
} from '../../members/profile-schema';
import {
  MEMBER_STATUS_BADGE_VARIANT,
  MEMBER_STATUS_LABELS,
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../../lib/format/member-status';

const PROFILE_QUERY_KEY: QueryKey = ['members', 'me'];

export function ProfilePage() {
  const profileQuery = useQuery({ queryKey: PROFILE_QUERY_KEY, queryFn: fetchMemberProfile });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Mi perfil"
        description="Consulta tus datos y actualiza tu teléfono de contacto."
      />

      {profileQuery.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando tu perfil…" />
        </div>
      ) : null}

      {profileQuery.isError ? (
        <ErrorState
          title="No pudimos cargar tu perfil"
          description={
            profileQuery.error instanceof ApiRequestError
              ? profileQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void profileQuery.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {profileQuery.data ? <ProfileContent member={profileQuery.data} /> : null}
    </div>
  );
}

interface ProfileContentProps {
  member: Member;
}

const CONTACT_FIELDS = ['phone'] as const;
type ContactField = (typeof CONTACT_FIELDS)[number];

function isContactField(field: string): field is ContactField {
  return (CONTACT_FIELDS as readonly string[]).includes(field);
}

function ProfileContent({ member }: ProfileContentProps) {
  const queryClient = useQueryClient();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ProfileContactFormValues>({
    resolver: zodResolver(profileContactFormSchema),
    defaultValues: { phone: member.phone ?? '' },
  });

  const mutation = useMutation({
    mutationFn: updateMemberProfile,
    onSuccess: (updated) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, updated);
      setFormError(null);
      setSuccessMessage('Tu teléfono se actualizó correctamente.');
    },
    onError: (error: unknown) => {
      setSuccessMessage(null);
      if (error instanceof ApiRequestError) {
        if (error.code === 'VALIDATION_ERROR') {
          let handled = false;
          error.details?.forEach((detail) => {
            if (isContactField(detail.field)) {
              setError(detail.field, { message: detail.issue });
              handled = true;
            }
          });
          setFormError(
            handled ? null : error.message || 'Revisa el teléfono ingresado e intenta nuevamente.',
          );
          return;
        }
        setFormError(error.message || 'No se pudo guardar el teléfono. Intenta nuevamente.');
        return;
      }
      setFormError('No se pudo guardar el teléfono. Intenta nuevamente.');
    },
  });

  const onSubmit = handleSubmit((values) => {
    setSuccessMessage(null);
    setFormError(null);
    mutation.mutate({ phone: values.phone });
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={`${member.firstName} ${member.lastName}`}
          description="Datos de tu cuenta"
        />
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">DNI</dt>
            <dd className="mt-1 text-sm text-slate-900">{member.dni}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Correo electrónico
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{member.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado de socio
            </dt>
            <dd className="mt-1">
              <Badge variant={MEMBER_STATUS_BADGE_VARIANT[member.memberStatus]}>
                {MEMBER_STATUS_LABELS[member.memberStatus]}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Estado de membresía
            </dt>
            <dd className="mt-1">
              <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[member.membershipStatus]}>
                {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader
          title="Datos de contacto"
          description="El teléfono es el único dato que puedes actualizar desde aquí. Tu DNI y correo de identidad no se pueden editar."
        />
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Teléfono"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            required
            {...register('phone')}
            errorMessage={errors.phone?.message}
          />

          {successMessage ? (
            <p
              role="status"
              className="rounded-lg border border-positive-200 bg-positive-50 px-3 py-2 text-sm text-positive-800"
            >
              {successMessage}
            </p>
          ) : null}

          {formError ? (
            <p
              role="alert"
              className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              {formError}
            </p>
          ) : null}

          <Button type="submit" isLoading={mutation.isPending} fullWidth>
            Guardar cambios
          </Button>
        </form>
      </Card>
    </div>
  );
}
