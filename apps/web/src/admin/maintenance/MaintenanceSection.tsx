// Bloqueos por mantenimiento — interfaz de US-035 (criterios 10, 11 y 13).
//
// Crear un bloqueo (`POST /resources/{id}/maintenance`) eligiendo instalación,
// rango de fecha y hora de Lima y motivo; mostrar `affectedReservationCount`
// con la nota de que esas reservas NO se cancelan solas; listar los bloqueos
// vigentes (`GET .../maintenance`) y liberarlos con confirmación
// (`DELETE ...`, 204 sin cuerpo). El servidor decide: aquí solo se anticipan
// validaciones básicas.

import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Spinner,
  Textarea,
  buttonVariants,
} from '@activa-club/ui';
import type { CreateMaintenanceResponse, MaintenanceBlock } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { useResourcesQuery } from '../../resources/resources-query';
import {
  createMaintenanceBlock,
  listMaintenanceBlocks,
  releaseMaintenanceBlock,
} from './admin-maintenance-client';
import {
  toBlocksLoadError,
  toCreateBlockFeedback,
  toReleaseBlockFeedback,
} from './admin-maintenance-errors';
import {
  REASON_MAX_LENGTH,
  buildMaintenanceRequest,
  formatDateTimeInLima,
  maintenanceFormSchema,
  type MaintenanceFormValues,
} from './maintenance-form';

const SELECT_CLASS =
  'block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500';

function blocksQueryKey(resourceId: string) {
  return ['resources', resourceId, 'maintenance'] as const;
}

interface Notice {
  type: 'success' | 'error';
  title: string;
  message: string;
}

export function MaintenanceSection() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const resourcesQuery = useResourcesQuery();
  const resources = useMemo(() => resourcesQuery.data ?? [], [resourcesQuery.data]);
  const resourceNames = useMemo(
    () => new Map(resources.map((resource) => [resource.resourceId, resource.name] as const)),
    [resources],
  );

  const [created, setCreated] = useState<CreateMaintenanceResponse | null>(null);
  const [createError, setCreateError] = useState<Notice | null>(null);

  // La lista sigue por defecto a la primera instalación; al crear un bloqueo
  // pasa a la instalación bloqueada para que el administrador lo vea.
  const [listResourceChoice, setListResourceChoice] = useState('');
  const listResourceId = listResourceChoice || resources[0]?.resourceId || '';

  const createMutation = useMutation({
    mutationFn: ({
      resourceId,
      request,
    }: {
      resourceId: string;
      request: NonNullable<ReturnType<typeof buildMaintenanceRequest>>;
    }) => createMaintenanceBlock(resourceId, request),
  });

  const form = useForm<MaintenanceFormValues>({
    resolver: zodResolver(maintenanceFormSchema),
    defaultValues: {
      resourceId: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      reason: '',
    },
    mode: 'onTouched',
  });
  const errors = form.formState.errors;
  const resourceFieldId = useId();
  const listFieldId = useId();

  async function handleCreate(values: MaintenanceFormValues) {
    setCreated(null);
    setCreateError(null);
    const request = buildMaintenanceRequest(values);
    if (!request) {
      setCreateError({
        type: 'error',
        title: 'Revisa los datos',
        message: 'Las fechas ingresadas no son válidas. Corrígelas e intenta de nuevo.',
      });
      return;
    }
    try {
      const response = await createMutation.mutateAsync({
        resourceId: values.resourceId,
        request,
      });
      setCreated(response);
      setListResourceChoice(values.resourceId);
      form.reset();
      void queryClient.invalidateQueries({ queryKey: blocksQueryKey(values.resourceId) });
      void queryClient.invalidateQueries({
        queryKey: ['resources', values.resourceId, 'availability'],
      });
    } catch (error) {
      const feedback = toCreateBlockFeedback(error);
      setCreateError({ type: 'error', title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        void queryClient.invalidateQueries({ queryKey: blocksQueryKey(values.resourceId) });
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    }
  }

  return (
    <section aria-labelledby="maintenance-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="maintenance-heading" className="text-lg font-semibold text-slate-900">
          Bloqueos por mantenimiento
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Bloquea una instalación durante un rango de fecha y hora (hora de Lima). Mientras dure, no
          admite reservas nuevas.
        </p>
      </div>

      <div className="rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
        <p className="font-semibold">Las reservas existentes no se cancelan solas</p>
        <p className="mt-1">
          Un bloqueo impide reservas nuevas, pero las reservas que ya estaban dentro de la ventana
          siguen vigentes hasta que las canceles. Puedes cancelarlas sin la restricción de 24 horas
          desde{' '}
          <Link to="/admin/reservas" className="font-medium underline">
            Reservas
          </Link>
          .
        </p>
      </div>

      <Card>
        <form
          aria-label="Nuevo bloqueo por mantenimiento"
          noValidate
          onSubmit={(event) => void form.handleSubmit(handleCreate)(event)}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor={resourceFieldId} className="text-sm font-medium text-slate-700">
              Instalación
              <span className="ml-0.5 text-danger-600" aria-hidden="true">
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
              <p role="alert" className="text-sm text-danger-600">
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

          {createError ? (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-xl border border-danger-200 bg-danger-50 p-4 text-sm text-danger-800"
            >
              <p className="font-semibold">{createError.title}</p>
              <p>{createError.message}</p>
            </div>
          ) : null}

          <Button type="submit" isLoading={createMutation.isPending} className="self-start">
            Crear bloqueo
          </Button>
        </form>
      </Card>

      {created ? (
        <CreatedBlockResult
          block={created}
          resourceName={resourceNames.get(created.resourceId) ?? 'la instalación'}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <h3 className="text-base font-semibold text-slate-900">Bloqueos vigentes</h3>
        <div className="max-w-sm">
          <label htmlFor={listFieldId} className="text-sm font-medium text-slate-700">
            Ver bloqueos de
          </label>
          <select
            id={listFieldId}
            value={listResourceId}
            onChange={(event) => setListResourceChoice(event.target.value)}
            className={`${SELECT_CLASS} mt-1`}
            disabled={resources.length === 0}
          >
            {resources.map((resource) => (
              <option key={resource.resourceId} value={resource.resourceId}>
                {resource.name}
              </option>
            ))}
          </select>
        </div>

        {resourcesQuery.isError ? (
          <p className="text-sm text-danger-700">
            Sin el catálogo no podemos elegir instalación. Reintenta la carga desde la sección
            Instalaciones.
          </p>
        ) : null}

        {listResourceId ? (
          <BlocksList
            key={listResourceId}
            resourceId={listResourceId}
            resourceName={resourceNames.get(listResourceId) ?? 'la instalación'}
          />
        ) : null}
      </div>
    </section>
  );
}

function CreatedBlockResult({
  block,
  resourceName,
}: {
  block: CreateMaintenanceResponse;
  resourceName: string;
}) {
  const count = block.affectedReservationCount;
  return (
    <div role="status" className="flex flex-col gap-3">
      <div className="rounded-xl border border-positive-200 bg-positive-50 p-4 text-sm text-positive-900">
        <p className="font-semibold">Bloqueo creado</p>
        <p>
          {resourceName}: del {formatDateTimeInLima(block.startsAt)} al{' '}
          {formatDateTimeInLima(block.endsAt)} (hora de Lima). Ya no admite reservas nuevas en esa
          ventana.
        </p>
      </div>
      {count > 0 ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning-200 bg-warning-50 p-4 text-sm text-warning-900">
          <p className="font-semibold">
            {count === 1
              ? '1 reserva activa queda dentro de la ventana'
              : `${count} reservas activas quedan dentro de la ventana`}
          </p>
          <p>
            No se cancelan solas: siguen vigentes hasta que decidas qué hacer con ellas. Revísalas y
            cancélalas desde la lista de reservas si corresponde.
          </p>
          <Link
            to="/admin/reservas"
            className={buttonVariants({ variant: 'secondary' }) + ' self-start'}
          >
            Ir a reservas
          </Link>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Ninguna reserva activa queda dentro de la ventana bloqueada.
        </p>
      )}
    </div>
  );
}

function BlocksList({ resourceId, resourceName }: { resourceId: string; resourceName: string }) {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: blocksQueryKey(resourceId),
    queryFn: () => listMaintenanceBlocks(resourceId),
  });
  const [releaseTarget, setReleaseTarget] = useState<MaintenanceBlock | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const releaseMutation = useMutation({
    mutationFn: (blockId: string) => releaseMaintenanceBlock(resourceId, blockId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: blocksQueryKey(resourceId) });
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  }

  async function confirmRelease() {
    if (!releaseTarget) {
      return;
    }
    const target = releaseTarget;
    try {
      await releaseMutation.mutateAsync(target.blockId);
      setReleaseTarget(null);
      setNotice({
        type: 'success',
        title: 'Bloqueo liberado',
        message: `${resourceName} vuelve a admitir reservas en esa ventana.`,
      });
      refresh();
    } catch (error) {
      const feedback = toReleaseBlockFeedback(error);
      setReleaseTarget(null);
      setNotice({ type: 'error', title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        refresh();
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    }
  }

  const blocks = query.data?.items ?? [];
  const loadError = query.isError ? toBlocksLoadError(query.error) : null;

  return (
    <div className="flex flex-col gap-3">
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
        <div className="flex justify-center py-8">
          <Spinner size="lg" label="Cargando bloqueos…" />
        </div>
      ) : null}

      {loadError ? (
        <Card>
          <ErrorState
            title="No pudimos cargar los bloqueos"
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

      {query.data && blocks.length === 0 ? (
        <Card>
          <EmptyState
            title="Sin bloqueos vigentes"
            description={`${resourceName} no tiene bloqueos por mantenimiento vigentes ni futuros.`}
          />
        </Card>
      ) : null}

      {blocks.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {blocks.map((block) => (
            <li key={block.blockId}>
              <Card
                compact
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">
                    {formatDateTimeInLima(block.startsAt)} – {formatDateTimeInLima(block.endsAt)}
                  </p>
                  <p className="text-slate-600">{block.reason ?? 'Sin motivo indicado'}</p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Liberar bloqueo del ${formatDateTimeInLima(block.startsAt)}`}
                  onClick={() => {
                    setNotice(null);
                    setReleaseTarget(block);
                  }}
                >
                  Liberar
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={releaseTarget !== null}
        title="¿Liberar este bloqueo?"
        description={
          releaseTarget
            ? `${resourceName}, del ${formatDateTimeInLima(releaseTarget.startsAt)} al ${formatDateTimeInLima(
                releaseTarget.endsAt,
              )}. La instalación volverá a admitir reservas en esa ventana (si no hay otro bloqueo que la cubra).`
            : undefined
        }
        confirmLabel="Sí, liberar bloqueo"
        cancelLabel="Mantener bloqueo"
        confirmVariant="positive"
        isLoading={releaseMutation.isPending}
        onConfirm={() => void confirmRelease()}
        onCancel={() => {
          if (!releaseMutation.isPending) {
            setReleaseTarget(null);
          }
        }}
      />
    </div>
  );
}
