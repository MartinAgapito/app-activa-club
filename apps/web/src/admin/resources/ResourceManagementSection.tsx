// Gestión de instalaciones — interfaz de US-036 (criterios 5 y 12).
//
// Catálogo de recursos (`GET /resources`) con aforo, horario y estado, y
// edición de los cuatro campos que el contrato permite
// (`PATCH /resources/{id}`: `capacity`, `opensAt`, `closesAt`,
// `resourceStatus`) con confirmación explícita. `blockMinutes`, tipo, nombre y
// `requiresApproval` se muestran de solo lectura: su fuente de verdad es
// Terraform (ADR-0010). La interfaz anticipa validaciones; el servidor decide.

import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
} from '@activa-club/ui';
import type { Resource, UpdateResourceRequest } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import {
  RESOURCE_STATUS_BADGE_VARIANT,
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../../lib/format/resource';
import { RESOURCES_QUERY_KEY, useResourcesQuery } from '../../resources/resources-query';
import { updateResource } from './admin-resources-client';
import { toResourceLoadError, toResourceUpdateFeedback } from './admin-resources-errors';
import {
  buildResourceUpdate,
  describeChangeNotes,
  describeChanges,
  isValidResourceUpdate,
  resourceEditFormSchema,
  toFormValues,
  type ResourceEditFormValues,
} from './resource-edit';

interface Notice {
  type: 'success' | 'error';
  title: string;
  message: string;
}

const SELECT_CLASS =
  'block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

export function ResourceManagementSection() {
  const { signOut } = useAuth();
  const query = useResourcesQuery();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const resources = query.data ?? [];
  const loadError = query.isError ? toResourceLoadError(query.error) : null;

  return (
    <section aria-labelledby="resource-management-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="resource-management-heading" className="text-lg font-semibold text-slate-900">
          Instalaciones
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Ajusta el aforo, el horario y el estado de cada instalación. Los cambios se aplican de
          inmediato a las reservas nuevas.
        </p>
      </div>

      <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-900">
        <p className="font-semibold">Qué pasa con las reservas ya creadas</p>
        <p className="mt-1">
          Bajar el aforo o cambiar el horario <strong>no invalida las reservas ya creadas</strong>:
          solo limita las reservas nuevas. Si alguna reserva existente quedó fuera del nuevo
          horario, puedes cancelarla desde Reservas.
        </p>
      </div>

      {notice ? (
        <div
          role={notice.type === 'error' ? 'alert' : 'status'}
          className={
            notice.type === 'success'
              ? 'flex flex-col gap-1 rounded-xl border border-positive-200 bg-positive-50 p-4 text-sm text-positive-900'
              : 'flex flex-col gap-1 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800'
          }
        >
          <p className="font-semibold">{notice.title}</p>
          <p>{notice.message}</p>
        </div>
      ) : null}

      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando instalaciones…" />
        </div>
      ) : null}

      {loadError ? (
        <Card>
          <ErrorState
            title="No pudimos cargar las instalaciones"
            description={loadError.message}
            action={
              loadError.sessionExpired ? (
                <Button onClick={signOut}>Iniciar sesión</Button>
              ) : (
                <Button onClick={() => void query.refetch()}>Reintentar</Button>
              )
            }
          />
        </Card>
      ) : null}

      {query.data && resources.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay instalaciones en el catálogo"
            description="Las instalaciones se definen en la infraestructura del club; aquí solo se ajustan."
          />
        </Card>
      ) : null}

      {resources.length > 0 ? (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {resources.map((resource) => (
            <li key={resource.resourceId}>
              <ResourceCard
                resource={resource}
                isEditing={editingId === resource.resourceId}
                onEdit={() => {
                  setNotice(null);
                  setEditingId(resource.resourceId);
                }}
                onClose={() => setEditingId(null)}
                onSaved={(updated) => {
                  setEditingId(null);
                  setNotice({
                    type: 'success',
                    title: 'Cambios guardados',
                    message: `${updated.name} se actualizó. Los cambios ya rigen para las reservas nuevas.`,
                  });
                }}
                onFailed={(title, message) => {
                  setEditingId(null);
                  setNotice({ type: 'error', title, message });
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface ResourceCardProps {
  resource: Resource;
  isEditing: boolean;
  onEdit: () => void;
  onClose: () => void;
  onSaved: (updated: Resource) => void;
  onFailed: (title: string, message: string) => void;
}

function ResourceCard({
  resource,
  isEditing,
  onEdit,
  onClose,
  onSaved,
  onFailed,
}: ResourceCardProps) {
  return (
    <Card compact className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{resource.name}</h3>
          <p className="text-sm text-slate-600">{RESOURCE_TYPE_LABEL[resource.type]}</p>
        </div>
        <Badge variant={RESOURCE_STATUS_BADGE_VARIANT[resource.resourceStatus]}>
          {RESOURCE_STATUS_LABEL[resource.resourceStatus]}
        </Badge>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-slate-500">Aforo</dt>
          <dd className="font-medium text-slate-900">{resource.capacity} personas</dd>
        </div>
        <div>
          <dt className="text-slate-500">Horario</dt>
          <dd className="font-medium text-slate-900">
            {resource.opensAt} – {resource.closesAt}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Duración del bloque</dt>
          <dd className="text-slate-900">{formatBlockDuration(resource.blockMinutes)}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Requiere aprobación</dt>
          <dd className="text-slate-900">{resource.requiresApproval ? 'Sí' : 'No'}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">
        Nombre, tipo, duración del bloque y aprobación son parte de la definición de la instalación
        y no se editan aquí.
      </p>

      {isEditing ? (
        <ResourceEditForm
          resource={resource}
          onCancel={onClose}
          onSaved={onSaved}
          onFailed={onFailed}
        />
      ) : (
        <Button
          type="button"
          variant="secondary"
          className="mt-auto self-start"
          onClick={onEdit}
          aria-label={`Editar ${resource.name}`}
        >
          Editar
        </Button>
      )}
    </Card>
  );
}

interface ResourceEditFormProps {
  resource: Resource;
  onCancel: () => void;
  onSaved: (updated: Resource) => void;
  onFailed: (title: string, message: string) => void;
}

function ResourceEditForm({ resource, onCancel, onSaved, onFailed }: ResourceEditFormProps) {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const statusId = useId();
  const [pendingChange, setPendingChange] = useState<UpdateResourceRequest | null>(null);
  const [noChanges, setNoChanges] = useState(false);

  const form = useForm<ResourceEditFormValues>({
    resolver: zodResolver(resourceEditFormSchema),
    defaultValues: toFormValues(resource),
    mode: 'onTouched',
  });
  const statusValue = useWatch({ control: form.control, name: 'resourceStatus' });

  const mutation = useMutation({
    mutationFn: (request: UpdateResourceRequest) => updateResource(resource.resourceId, request),
    onSuccess: (updated) => {
      queryClient.setQueryData<Resource[]>(RESOURCES_QUERY_KEY, (current) =>
        current?.map((item) => (item.resourceId === updated.resourceId ? updated : item)),
      );
      void queryClient.invalidateQueries({
        queryKey: ['resources', resource.resourceId, 'availability'],
      });
      setPendingChange(null);
      onSaved(updated);
    },
    onError: (error: unknown) => {
      const feedback = toResourceUpdateFeedback(error);
      setPendingChange(null);
      if (feedback.refresh) {
        void queryClient.invalidateQueries({ queryKey: RESOURCES_QUERY_KEY, exact: true });
      }
      if (feedback.sessionExpired) {
        signOut();
      }
      onFailed(feedback.title, feedback.message);
    },
  });

  function handleValid(values: ResourceEditFormValues) {
    const request = buildResourceUpdate(resource, values);
    if (Object.keys(request).length === 0) {
      setNoChanges(true);
      return;
    }
    if (!isValidResourceUpdate(request)) {
      onFailed(
        'Revisa los datos',
        'Los valores ingresados no cumplen el formato esperado. Corrígelos e intenta de nuevo.',
      );
      return;
    }
    setNoChanges(false);
    setPendingChange(request);
  }

  const changes = pendingChange ? describeChanges(resource, pendingChange) : [];
  const notes = pendingChange ? describeChangeNotes(resource, pendingChange) : null;
  const errors = form.formState.errors;

  return (
    <>
      <form
        aria-label={`Editar ${resource.name}`}
        noValidate
        onSubmit={(event) => {
          setNoChanges(false);
          void form.handleSubmit(handleValid)(event);
        }}
        className="flex flex-col gap-4 border-t border-slate-200 pt-4"
      >
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          label="Aforo (personas)"
          required
          {...form.register('capacity', { valueAsNumber: true })}
          errorMessage={errors.capacity?.message}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            type="time"
            label="Hora de apertura"
            required
            {...form.register('opensAt')}
            errorMessage={errors.opensAt?.message}
          />
          <Input
            type="time"
            label="Hora de cierre"
            required
            {...form.register('closesAt')}
            errorMessage={errors.closesAt?.message}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={statusId} className="text-sm font-medium text-slate-700">
            Estado
          </label>
          <select id={statusId} className={SELECT_CLASS} {...form.register('resourceStatus')}>
            <option value="AVAILABLE">{RESOURCE_STATUS_LABEL.AVAILABLE}</option>
            <option value="MAINTENANCE">{RESOURCE_STATUS_LABEL.MAINTENANCE}</option>
          </select>
          {statusValue === 'MAINTENANCE' ? (
            <p className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-sm text-warning-900">
              Poner la instalación en mantenimiento es un bloqueo <strong>indefinido</strong>: no
              admitirá reservas nuevas hasta que vuelvas a habilitarla. Las reservas existentes
              siguen vigentes y no se cancelan solas. Para bloquear solo un rango de fechas, usa un
              bloqueo temporal por mantenimiento.
            </p>
          ) : null}
        </div>

        {noChanges ? (
          <p role="status" className="text-sm text-slate-600">
            No hay cambios para guardar.
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">Revisar cambios</Button>
        </div>
      </form>

      <ConfirmDialog
        open={pendingChange !== null}
        title={`¿Guardar los cambios en ${resource.name}?`}
        description="Revisa el resumen antes de confirmar. Los cambios rigen de inmediato para las reservas nuevas."
        confirmLabel="Guardar cambios"
        confirmVariant="positive"
        isLoading={mutation.isPending}
        onConfirm={() => {
          if (pendingChange) {
            mutation.mutate(pendingChange);
          }
        }}
        onCancel={() => {
          if (!mutation.isPending) {
            setPendingChange(null);
          }
        }}
      >
        <ul className="flex flex-col gap-1 text-sm text-slate-800">
          {changes.map((line) => (
            <li key={line.label}>
              <span className="font-medium">{line.label}:</span> {line.from} → {line.to}
            </li>
          ))}
        </ul>
        {notes?.existingReservationsKept ? (
          <p className="mt-3 text-sm text-slate-600">
            Las reservas ya creadas no se invalidan: el cambio solo limita las reservas nuevas.
          </p>
        ) : null}
        {notes?.indefiniteMaintenance ? (
          <p className="mt-3 text-sm text-warning-900">
            Es un bloqueo indefinido: no habrá reservas nuevas hasta que la habilites. Las reservas
            existentes siguen vigentes.
          </p>
        ) : null}
      </ConfirmDialog>
    </>
  );
}
