// Edición de una instalación en una ventana — US-075.
//
// Formulario de los cuatro campos que el contrato permite
// (`PATCH /resources/{id}`: `capacity`, `opensAt`, `closesAt`,
// `resourceStatus`). Nombre, tipo, duración del bloque y aprobación se
// muestran de solo lectura: su fuente de verdad es Terraform (ADR-0010).
// Los errores del servidor se muestran dentro de la ventana, sin cerrarla y
// sin perder lo escrito. La interfaz anticipa validaciones; el servidor decide.

import { useId, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Input, Modal, useToast } from '@activa-club/ui';
import type { Resource, UpdateResourceRequest } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import {
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../../lib/format/resource';
import { RESOURCES_QUERY_KEY } from '../../resources/resources-query';
import { SELECT_CLASS } from '../shared/select-class';
import { updateResource } from './admin-resources-client';
import { toResourceUpdateFeedback } from './admin-resources-errors';
import {
  buildResourceUpdate,
  describeChangeNotes,
  describeChanges,
  isValidResourceUpdate,
  resourceEditFormSchema,
  toFormValues,
  type ResourceEditFormValues,
} from './resource-edit';

interface ServerError {
  title: string;
  message: string;
}

/** Aforo, horario o paso a mantenimiento piden confirmación con el resumen
 * antes → después; volver a "Disponible" se guarda directo. */
function needsConfirmation(request: UpdateResourceRequest): boolean {
  return (
    request.capacity !== undefined ||
    request.opensAt !== undefined ||
    request.closesAt !== undefined ||
    request.resourceStatus === 'MAINTENANCE'
  );
}

export interface ResourceEditModalProps {
  resource: Resource;
  onClose: () => void;
}

/** Se monta solo mientras hay una instalación en edición (el padre la
 * desmonta al cerrar), de modo que el formulario siempre parte de cero. */
export function ResourceEditModal({ resource, onClose }: ResourceEditModalProps) {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const formId = useId();
  const statusId = useId();
  const [pendingChange, setPendingChange] = useState<UpdateResourceRequest | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [serverError, setServerError] = useState<ServerError | null>(null);

  const form = useForm<ResourceEditFormValues>({
    resolver: zodResolver(resourceEditFormSchema),
    defaultValues: toFormValues(resource),
    mode: 'onChange',
  });
  const watched = useWatch({ control: form.control });
  const statusValue = watched.resourceStatus;
  const hasChanges =
    Object.keys(
      buildResourceUpdate(resource, {
        ...toFormValues(resource),
        ...watched,
      } as ResourceEditFormValues),
    ).length > 0;

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
      toast.success('Instalación actualizada');
      onClose();
    },
    onError: (error: unknown) => {
      const feedback = toResourceUpdateFeedback(error);
      setPendingChange(null);
      setServerError({ title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        void queryClient.invalidateQueries({ queryKey: RESOURCES_QUERY_KEY, exact: true });
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    },
  });

  function handleValid(values: ResourceEditFormValues) {
    const request = buildResourceUpdate(resource, values);
    if (Object.keys(request).length === 0) {
      return;
    }
    if (!isValidResourceUpdate(request)) {
      setServerError({
        title: 'Revisa los datos',
        message:
          'Los valores ingresados no cumplen el formato esperado. Corrígelos e intenta de nuevo.',
      });
      return;
    }
    if (needsConfirmation(request)) {
      setPendingChange(request);
    } else {
      mutation.mutate(request);
    }
  }

  function requestClose() {
    if (mutation.isPending) {
      return;
    }
    if (hasChanges) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  }

  const changes = pendingChange ? describeChanges(resource, pendingChange) : [];
  const notes = pendingChange ? describeChangeNotes(resource, pendingChange) : null;
  const errors = form.formState.errors;

  return (
    <>
      <Modal
        open
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          }
        }}
        dismissible={!mutation.isPending}
        title={`Editar ${resource.name}`}
        description="Ajusta el aforo, el horario o el estado. Los cambios rigen de inmediato para las reservas nuevas."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form={formId}
              disabled={!hasChanges}
              isLoading={mutation.isPending && pendingChange === null}
            >
              Guardar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <section aria-labelledby={`${formId}-readonly`}>
            <h3 id={`${formId}-readonly`} className="type-aux font-semibold text-ink-muted">
              Datos fijos de la instalación
            </h3>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">Tipo</dt>
                <dd className="text-ink">{RESOURCE_TYPE_LABEL[resource.type]}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Nombre</dt>
                <dd className="text-ink">{resource.name}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Duración del bloque</dt>
                <dd className="text-ink">{formatBlockDuration(resource.blockMinutes)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Requiere aprobación</dt>
                <dd className="text-ink">{resource.requiresApproval ? 'Sí' : 'No'}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-ink-muted">
              Estos datos son parte de la definición de la instalación y se cambian por despliegue
              (ADR-0010); no se editan aquí.
            </p>
          </section>

          <form
            id={formId}
            aria-label={`Editar ${resource.name}`}
            noValidate
            onSubmit={(event) => {
              setServerError(null);
              void form.handleSubmit(handleValid)(event);
            }}
            className="flex flex-col gap-4"
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
              <label htmlFor={statusId} className="text-sm font-medium text-ink">
                Estado
              </label>
              <select id={statusId} className={SELECT_CLASS} {...form.register('resourceStatus')}>
                <option value="AVAILABLE">{RESOURCE_STATUS_LABEL.AVAILABLE}</option>
                <option value="MAINTENANCE">{RESOURCE_STATUS_LABEL.MAINTENANCE}</option>
              </select>
              {statusValue === 'MAINTENANCE' ? (
                <p className="rounded-control border border-status-pending bg-status-pending-soft px-3 py-2 text-sm text-ink">
                  Poner la instalación en mantenimiento es un bloqueo <strong>indefinido</strong>:
                  no admitirá reservas nuevas hasta que vuelvas a habilitarla. Las reservas
                  existentes siguen vigentes y no se cancelan solas. Para bloquear solo un rango de
                  fechas, usa un bloqueo temporal desde la pestaña Mantenimiento.
                </p>
              ) : null}
            </div>
          </form>

          {serverError ? (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-control border border-status-problem bg-status-problem-soft p-3 text-sm text-ink"
            >
              <p className="font-semibold">{serverError.title}</p>
              <p>{serverError.message}</p>
            </div>
          ) : null}
        </div>
      </Modal>

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
        <ul className="flex flex-col gap-1 text-sm text-ink">
          {changes.map((line) => (
            <li key={line.label}>
              <span className="font-medium">{line.label}:</span> {line.from} → {line.to}
            </li>
          ))}
        </ul>
        {notes?.existingReservationsKept ? (
          <p className="mt-3 text-sm text-ink-muted">
            Las reservas ya creadas no se invalidan: el cambio solo limita las reservas nuevas.
          </p>
        ) : null}
        {notes?.indefiniteMaintenance ? (
          <p className="mt-3 text-sm text-ink">
            Es un bloqueo indefinido: no habrá reservas nuevas hasta que la habilites. Las reservas
            existentes siguen vigentes.
          </p>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={discardOpen}
        title="¿Descartar los cambios?"
        description="Modificaste la instalación y aún no guardaste. Si cierras la ventana, se perderán."
        confirmLabel="Descartar cambios"
        cancelLabel="Seguir editando"
        confirmVariant="danger"
        onConfirm={onClose}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  );
}
