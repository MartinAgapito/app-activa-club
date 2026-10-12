// Nuevo bloqueo por mantenimiento en una ventana — US-076.
//
// `POST /resources/{id}/maintenance`: instalación (precargada), inicio y fin
// en hora de Lima y motivo. La respuesta trae `affectedReservationCount`: las
// reservas existentes dentro de la ventana NO se cancelan solas, por lo que
// se avisa con un aviso persistente y un acceso a la lista de reservas. Los
// errores del servidor se muestran dentro de la ventana, sin cerrarla ni
// perder lo escrito. El servidor decide; aquí solo se anticipan validaciones.

import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, Input, Modal, Textarea, useToast } from '@activa-club/ui';
import type { CreateMaintenanceResponse, Resource } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { SELECT_CLASS } from '../shared/select-class';
import { createMaintenanceBlock } from './admin-maintenance-client';
import { toCreateBlockFeedback } from './admin-maintenance-errors';
import {
  REASON_MAX_LENGTH,
  buildMaintenanceRequest,
  maintenanceBlocksQueryKey,
  maintenanceFormSchema,
  type MaintenanceFormValues,
} from './maintenance-form';

interface ServerError {
  title: string;
  message: string;
}

export interface NewBlockModalProps {
  resources: ReadonlyArray<Resource>;
  /** Instalación preseleccionada (la que se está viendo en la lista). */
  defaultResourceId: string;
  onClose: () => void;
  /** Se llama tras crear el bloqueo, antes de cerrar la ventana. */
  onCreated: (block: CreateMaintenanceResponse) => void;
}

export function NewBlockModal({
  resources,
  defaultResourceId,
  onClose,
  onCreated,
}: NewBlockModalProps) {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const formId = useId();
  const resourceFieldId = useId();
  const [serverError, setServerError] = useState<ServerError | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      resourceId: defaultResourceId,
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      reason: '',
    },
    mode: 'onTouched',
  });
  // Se lee en el render para suscribirse al estado `isDirty` del formulario.
  const { errors, isDirty } = form.formState;

  const mutation = useMutation({
    mutationFn: ({
      resourceId,
      request,
    }: {
      resourceId: string;
      request: NonNullable<ReturnType<typeof buildMaintenanceRequest>>;
    }) => createMaintenanceBlock(resourceId, request),
  });

  async function handleCreate(values: MaintenanceFormValues) {
    setServerError(null);
    const request = buildMaintenanceRequest(values);
    if (!request) {
      setServerError({
        title: 'Revisa los datos',
        message: 'Las fechas ingresadas no son válidas. Corrígelas e intenta de nuevo.',
      });
      return;
    }
    try {
      const response = await mutation.mutateAsync({ resourceId: values.resourceId, request });
      void queryClient.invalidateQueries({
        queryKey: maintenanceBlocksQueryKey(values.resourceId),
      });
      void queryClient.invalidateQueries({
        queryKey: ['resources', values.resourceId, 'availability'],
      });
      toast.success('Bloqueo creado');
      const count = response.affectedReservationCount;
      if (count > 0) {
        toast.warning(
          count === 1
            ? '1 reserva queda dentro del bloqueo. No se cancela sola.'
            : `${count} reservas quedan dentro del bloqueo. No se cancelan solas.`,
          {
            id: `maintenance-affected-${response.blockId}`,
            duration: null,
            action: {
              label: 'Ver reservas',
              onClick: () =>
                navigate(`/admin/reservas?recurso=${encodeURIComponent(response.resourceId)}`),
            },
          },
        );
      }
      onCreated(response);
    } catch (error) {
      const feedback = toCreateBlockFeedback(error);
      setServerError({ title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        void queryClient.invalidateQueries({
          queryKey: maintenanceBlocksQueryKey(values.resourceId),
        });
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    }
  }

  function requestClose() {
    if (mutation.isPending) {
      return;
    }
    if (isDirty) {
      setDiscardOpen(true);
    } else {
      onClose();
    }
  }

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
        title="Nuevo bloqueo por mantenimiento"
        description="Mientras dure, la instalación no admite reservas nuevas. Las horas son de Lima."
        footer={
          <>
            <Button type="button" variant="secondary" onClick={requestClose}>
              Cancelar
            </Button>
            <Button type="submit" form={formId} isLoading={mutation.isPending}>
              Crear bloqueo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="rounded-control border border-status-pending bg-status-pending-soft p-3 text-sm text-ink">
            <p className="font-semibold">Las reservas ya creadas siguen vigentes</p>
            <p className="mt-1">
              Si alguna reserva ya estaba dentro de la ventana, sigue vigente hasta que la canceles
              desde Reservas. Al crear el bloqueo te diremos cuántas quedan afectadas.
            </p>
          </div>

          <form
            id={formId}
            aria-label="Nuevo bloqueo por mantenimiento"
            noValidate
            onSubmit={(event) => void form.handleSubmit(handleCreate)(event)}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor={resourceFieldId} className="text-sm font-medium text-ink">
                Instalación
                <span className="ml-0.5 text-status-problem" aria-hidden="true">
                  *
                </span>
              </label>
              <select
                id={resourceFieldId}
                className={SELECT_CLASS}
                aria-invalid={Boolean(errors.resourceId) || undefined}
                {...form.register('resourceId')}
              >
                <option value="">Elige una instalación</option>
                {resources.map((resource) => (
                  <option key={resource.resourceId} value={resource.resourceId}>
                    {resource.name}
                  </option>
                ))}
              </select>
              {errors.resourceId ? (
                <p role="alert" className="text-sm text-status-problem">
                  {errors.resourceId.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="date"
                label="Fecha de inicio"
                required
                {...form.register('startDate')}
                errorMessage={errors.startDate?.message}
              />
              <Input
                type="time"
                label="Hora de inicio"
                required
                {...form.register('startTime')}
                errorMessage={errors.startTime?.message}
              />
              <Input
                type="date"
                label="Fecha de fin"
                required
                {...form.register('endDate')}
                errorMessage={errors.endDate?.message}
              />
              <Input
                type="time"
                label="Hora de fin"
                required
                {...form.register('endTime')}
                errorMessage={errors.endTime?.message}
              />
            </div>

            <Textarea
              label="Motivo (opcional)"
              rows={3}
              helpText={`Hasta ${REASON_MAX_LENGTH} caracteres. Ej.: limpieza de piscina.`}
              {...form.register('reason')}
              errorMessage={errors.reason?.message}
            />
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
        open={discardOpen}
        title="¿Descartar el bloqueo?"
        description="Escribiste datos que aún no se guardaron. Si cierras la ventana, se perderán."
        confirmLabel="Descartar"
        cancelLabel="Seguir editando"
        confirmVariant="danger"
        onConfirm={onClose}
        onCancel={() => setDiscardOpen(false)}
      />
    </>
  );
}
