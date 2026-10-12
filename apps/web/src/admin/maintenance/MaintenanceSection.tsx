// Bloqueos por mantenimiento — interfaz de US-035 reorganizada en US-076.
//
// Selector de instalación (en la URL como `?recurso=`), tabla de sus bloqueos
// vigentes y futuros (`GET .../maintenance`, ordenados por inicio), "Nuevo
// bloqueo" en una ventana (`NewBlockModal`, `POST ...`) y "Liberar" con
// confirmación (`DELETE ...`, 204 sin cuerpo). La lista es por instalación:
// no hay listado global. `?nuevo=1` abre la ventana de nuevo bloqueo (acceso
// rápido del inicio del administrador).

import { useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, ConfirmDialog, DataTable, useToast, type DataTableColumn } from '@activa-club/ui';
import type { MaintenanceBlock } from '@activa-club/shared-types';
import { useAuth } from '../../auth/AuthContext';
import { useResourcesQuery } from '../../resources/resources-query';
import { SELECT_CLASS } from '../shared/select-class';
import { listMaintenanceBlocks, releaseMaintenanceBlock } from './admin-maintenance-client';
import { toBlocksLoadError, toReleaseBlockFeedback } from './admin-maintenance-errors';
import { formatDateTimeInLima, maintenanceBlocksQueryKey } from './maintenance-form';
import { NewBlockModal } from './NewBlockModal';

interface ReleaseNotice {
  title: string;
  message: string;
}

export function MaintenanceSection() {
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const resourcesQuery = useResourcesQuery();
  const resources = useMemo(() => resourcesQuery.data ?? [], [resourcesQuery.data]);
  const selectId = useId();

  const recursoParam = searchParams.get('recurso');
  const resourceId =
    resources.find((resource) => resource.resourceId === recursoParam)?.resourceId ??
    resources[0]?.resourceId ??
    '';
  const resourceName =
    resources.find((resource) => resource.resourceId === resourceId)?.name ?? 'la instalación';

  const [createOpen, setCreateOpen] = useState(searchParams.get('nuevo') === '1');
  const [releaseTarget, setReleaseTarget] = useState<MaintenanceBlock | null>(null);
  const [notice, setNotice] = useState<ReleaseNotice | null>(null);

  // `nuevo=1` solo sirve para abrir la ventana: se retira de la URL para que
  // recargar o compartir el enlace no la vuelva a abrir.
  useEffect(() => {
    if (searchParams.get('nuevo') !== null) {
      const next = new URLSearchParams(searchParams);
      next.delete('nuevo');
      setSearchParams(next, { replace: true });
    }
    // Solo al montar: el parámetro es un acceso directo de una sola vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectResource(nextId: string) {
    const next = new URLSearchParams(searchParams);
    next.set('recurso', nextId);
    setSearchParams(next, { replace: true });
    setNotice(null);
  }

  const blocksQuery = useQuery({
    queryKey: maintenanceBlocksQueryKey(resourceId),
    queryFn: () => listMaintenanceBlocks(resourceId),
    enabled: resourceId !== '',
  });
  const blocks = useMemo(
    () => [...(blocksQuery.data?.items ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [blocksQuery.data],
  );
  const loadError = blocksQuery.isError ? toBlocksLoadError(blocksQuery.error) : null;

  const releaseMutation = useMutation({
    mutationFn: (blockId: string) => releaseMaintenanceBlock(resourceId, blockId),
  });

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: maintenanceBlocksQueryKey(resourceId) });
    void queryClient.invalidateQueries({ queryKey: ['resources', resourceId, 'availability'] });
  }

  async function confirmRelease() {
    if (!releaseTarget) {
      return;
    }
    try {
      await releaseMutation.mutateAsync(releaseTarget.blockId);
      setReleaseTarget(null);
      toast.success('Bloqueo liberado');
      refresh();
    } catch (error) {
      const feedback = toReleaseBlockFeedback(error);
      setReleaseTarget(null);
      setNotice({ title: feedback.title, message: feedback.message });
      if (feedback.refresh) {
        refresh();
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    }
  }

  const columns: ReadonlyArray<DataTableColumn<MaintenanceBlock>> = [
    {
      key: 'startsAt',
      header: 'Inicio',
      render: (block) => formatDateTimeInLima(block.startsAt),
    },
    {
      key: 'endsAt',
      header: 'Fin',
      render: (block) => formatDateTimeInLima(block.endsAt),
    },
    {
      key: 'reason',
      header: 'Motivo',
      render: (block) =>
        block.reason ?? <span className="text-ink-muted">Sin motivo indicado</span>,
    },
  ];

  const newBlockButton = (
    <Button type="button" onClick={() => setCreateOpen(true)} disabled={resources.length === 0}>
      Nuevo bloqueo
    </Button>
  );

  return (
    <section aria-labelledby="maintenance-heading" className="flex flex-col gap-4">
      <div>
        <h2 id="maintenance-heading" className="type-section-title text-ink">
          Bloqueos por mantenimiento
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Bloquea una instalación durante un rango de fecha y hora (hora de Lima). Mientras dure, no
          admite reservas nuevas.
        </p>
      </div>

      <div className="rounded-card border border-status-pending bg-status-pending-soft p-4 text-sm text-ink">
        <p className="font-semibold">Las reservas existentes no se cancelan solas</p>
        <p className="mt-1">
          Un bloqueo impide reservas nuevas, pero las reservas que ya estaban dentro de la ventana
          siguen vigentes hasta que las canceles. Puedes cancelarlas sin la restricción de 24 horas
          desde{' '}
          <Link to="/admin/reservas" className="font-medium text-action underline">
            Reservas
          </Link>
          .
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex w-full max-w-sm flex-col gap-1.5">
          <label htmlFor={selectId} className="text-sm font-medium text-ink">
            Ver bloqueos de
          </label>
          <select
            id={selectId}
            value={resourceId}
            onChange={(event) => selectResource(event.target.value)}
            className={SELECT_CLASS}
            disabled={resources.length === 0}
          >
            {resources.map((resource) => (
              <option key={resource.resourceId} value={resource.resourceId}>
                {resource.name}
              </option>
            ))}
          </select>
        </div>
        {newBlockButton}
      </div>

      {resourcesQuery.isError ? (
        <p role="alert" className="text-sm text-status-problem">
          Sin el catálogo no podemos elegir instalación.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => void resourcesQuery.refetch()}
          >
            Reintentar
          </button>
        </p>
      ) : null}

      {notice ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-card border border-status-problem bg-status-problem-soft p-4 text-sm text-ink"
        >
          <p className="font-semibold">{notice.title}</p>
          <p>{notice.message}</p>
        </div>
      ) : null}

      {resourceId ? (
        <DataTable
          caption={`Bloqueos vigentes: ${resourceName}`}
          columns={columns}
          rows={blocks}
          getRowKey={(block) => block.blockId}
          renderActions={(block) => (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={`Liberar bloqueo del ${formatDateTimeInLima(block.startsAt)}`}
              onClick={() => {
                setNotice(null);
                setReleaseTarget(block);
              }}
            >
              Liberar
            </Button>
          )}
          isLoading={blocksQuery.isPending}
          loadingLabel="Cargando bloqueos…"
          isError={loadError !== null}
          errorTitle="No pudimos cargar los bloqueos"
          errorDescription={loadError?.message}
          retryLabel={loadError?.sessionExpired ? 'Iniciar sesión' : 'Reintentar'}
          onRetry={loadError?.sessionExpired ? signOut : () => void blocksQuery.refetch()}
          emptyTitle="Sin bloqueos vigentes"
          emptyDescription={`${resourceName} no tiene bloqueos por mantenimiento vigentes ni futuros.`}
          emptyAction={newBlockButton}
        />
      ) : null}

      {createOpen && resourceId ? (
        <NewBlockModal
          resources={resources}
          defaultResourceId={resourceId}
          onClose={() => setCreateOpen(false)}
          onCreated={(created) => {
            setCreateOpen(false);
            setNotice(null);
            selectResource(created.resourceId);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={releaseTarget !== null}
        title="¿Liberar este bloqueo?"
        description="La instalación volverá a admitir reservas en esa ventana (si no hay otro bloqueo que la cubra)."
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
      >
        {releaseTarget ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-ink-muted">Instalación</dt>
            <dd className="text-ink">{resourceName}</dd>
            <dt className="text-ink-muted">Inicio</dt>
            <dd className="text-ink">{formatDateTimeInLima(releaseTarget.startsAt)}</dd>
            <dt className="text-ink-muted">Fin</dt>
            <dd className="text-ink">{formatDateTimeInLima(releaseTarget.endsAt)}</dd>
            <dt className="text-ink-muted">Motivo</dt>
            <dd className="text-ink">{releaseTarget.reason ?? 'Sin motivo indicado'}</dd>
          </dl>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
