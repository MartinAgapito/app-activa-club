// Reservas — catálogo de instalaciones que abre el asistente de reserva
// (US-073 sobre US-072, que reorganiza el flujo de US-028, US-029 y US-032).
//
// La página solo presenta las instalaciones y decide qué instalación
// preselecciona el asistente; elegir día, franja, participantes y confirmar
// ocurre dentro de la ventana (`ReservationWizard`), sin salir de la pantalla.
// Todas las reglas críticas las valida el servidor.
//
// Direcciones soportadas:
//   /socio/reservas                    catálogo completo
//   /socio/reservas?recurso=<id>       abre el asistente con esa instalación
//   /socio/reservas?tipo=<TIPO>        catálogo filtrado; con una sola
//                                      instalación abre el asistente

import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { UseQueryResult } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  buttonVariants,
  useToast,
} from '@activa-club/ui';
import type { Resource, ResourceType } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import {
  RESOURCE_STATUS_BADGE_VARIANT,
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../../lib/format/resource';
import { useMemberProfileQuery } from '../../members/profile-query';
import { useResourcesQuery } from '../../resources/resources-query';
import { RESERVATION_BLOCK_COPY, getReservationBlock } from '../../reservations/eligibility';
import { ReservationWizard, type CompletedReservation } from '../../reservations/ReservationWizard';

interface WizardSession {
  /** Cambia en cada apertura: el asistente arranca con un borrador limpio. */
  key: number;
  resourceId: string | null;
  open: boolean;
}

const BLOCK_NOTICE_ID = 'reservation-block-notice';

function isResourceType(value: string | null): value is ResourceType {
  return value !== null && value in RESOURCE_TYPE_LABEL;
}

export function ReservationsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const resourcesQuery = useResourcesQuery();
  const profileQuery = useMemberProfileQuery();

  const [session, setSession] = useState<WizardSession | null>(null);
  const sessionCounter = useRef(0);
  const deepLinkHandled = useRef(false);

  const recursoParam = searchParams.get('recurso');
  const tipoParam = searchParams.get('tipo');
  const typeFilter = isResourceType(tipoParam) ? tipoParam : null;

  const profile = profileQuery.data;
  const block = profile ? getReservationBlock(profile) : null;
  const resources = resourcesQuery.data;
  const visibleResources = resources
    ? typeFilter
      ? resources.filter((resource) => resource.type === typeFilter)
      : resources
    : undefined;
  const unknownResource =
    recursoParam !== null &&
    resources !== undefined &&
    !resources.some((resource) => resource.resourceId === recursoParam);

  function openWizard(resourceId: string | null) {
    sessionCounter.current += 1;
    setSession({ key: sessionCounter.current, resourceId, open: true });
  }

  // Deep link: se resuelve una sola vez, cuando el catálogo ya cargó.
  useEffect(() => {
    if (deepLinkHandled.current || !resources) return;
    deepLinkHandled.current = true;
    if (recursoParam && resources.some((resource) => resource.resourceId === recursoParam)) {
      openWizard(recursoParam);
    } else if (!recursoParam && typeFilter) {
      const ofType = resources.filter((resource) => resource.type === typeFilter);
      if (ofType.length === 1) {
        openWizard(ofType[0]!.resourceId);
      }
    }
    // Solo reacciona a la carga del catálogo. Si el perfil indica un bloqueo,
    // el asistente lo informa en lugar de los pasos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resources]);

  function closeWizard() {
    setSession((current) => (current ? { ...current, open: false } : current));
    if (searchParams.has('recurso')) {
      const next = new URLSearchParams(searchParams);
      next.delete('recurso');
      setSearchParams(next, { replace: true });
    }
  }

  function handleCompleted({ response }: CompletedReservation) {
    const isPending = response.reservationStatus === 'PENDING_APPROVAL';
    toast.success(isPending ? 'Solicitud enviada a revisión' : 'Reserva confirmada', {
      action: { label: 'Ver en Mis reservas', onClick: () => navigate('/socio/reservas/mias') },
    });
    closeWizard();
  }

  const canOpen = Boolean(resources && resources.length > 0) && !block;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reservas"
        description="Elige una instalación y reserva tu horario en unos pasos."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/socio/reservas/mias" className={buttonVariants({ variant: 'secondary' })}>
              Mis reservas
            </Link>
            <Button
              type="button"
              disabled={!canOpen}
              {...(block ? { 'aria-describedby': BLOCK_NOTICE_ID } : {})}
              onClick={() => openWizard(null)}
            >
              Nueva reserva
            </Button>
          </div>
        }
      />

      {block ? (
        <div
          id={BLOCK_NOTICE_ID}
          role="alert"
          className="flex flex-col gap-3 rounded-card border border-status-problem bg-status-problem-soft p-4"
        >
          <p className="text-base font-semibold text-status-problem">
            {RESERVATION_BLOCK_COPY[block].title}
          </p>
          <p className="text-sm text-ink">{RESERVATION_BLOCK_COPY[block].message}</p>
          <Link
            to="/socio/membresia/pagar"
            className={buttonVariants({ variant: 'primary', className: 'self-start' })}
          >
            Ir a pagar mi membresía
          </Link>
        </div>
      ) : null}

      {unknownResource ? (
        <p
          role="status"
          className="rounded-control border border-status-pending bg-status-pending-soft px-3 py-2 text-sm text-ink"
        >
          No encontramos esa instalación. Elige una del catálogo.
        </p>
      ) : null}

      <ResourceCatalogSection
        query={resourcesQuery}
        resources={visibleResources}
        typeFilter={typeFilter}
        blocked={Boolean(block)}
        onReserve={(resourceId) => openWizard(resourceId)}
      />

      {session && resources ? (
        <ReservationWizard
          key={session.key}
          open={session.open}
          resources={resources}
          initialResourceId={session.resourceId}
          onClose={closeWizard}
          onCompleted={handleCompleted}
        />
      ) : null}
    </div>
  );
}

// --- Catálogo (US-028, US-073) ---

interface ResourceCatalogSectionProps {
  query: UseQueryResult<Resource[]>;
  resources: Resource[] | undefined;
  typeFilter: ResourceType | null;
  blocked: boolean;
  onReserve: (resourceId: string) => void;
}

function ResourceCatalogSection({
  query,
  resources,
  typeFilter,
  blocked,
  onReserve,
}: ResourceCatalogSectionProps) {
  return (
    <section aria-labelledby="catalogo-instalaciones-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="catalogo-instalaciones-heading" className="type-section-title text-ink">
          {typeFilter
            ? `Instalaciones de ${RESOURCE_TYPE_LABEL[typeFilter].toLowerCase()}`
            : 'Instalaciones del club'}
        </h2>
        {typeFilter ? (
          <Link to="/socio/reservas" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Ver todas las instalaciones
          </Link>
        ) : null}
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el catálogo de instalaciones…" />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="No pudimos cargar el catálogo de instalaciones"
          description={
            query.error instanceof ApiRequestError
              ? query.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {resources && resources.length === 0 ? (
        <EmptyState
          title="Todavía no hay instalaciones cargadas"
          description="El catálogo del club se está configurando. Vuelve a intentarlo más tarde."
        />
      ) : null}

      {resources && resources.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resources.map((resource) => (
            <ResourceCard
              key={resource.resourceId}
              resource={resource}
              blocked={blocked}
              onReserve={() => onReserve(resource.resourceId)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

interface ResourceCardProps {
  resource: Resource;
  blocked: boolean;
  onReserve: () => void;
}

function ResourceCard({ resource, blocked, onReserve }: ResourceCardProps) {
  return (
    <Card compact className="flex flex-col gap-3">
      <CardHeader
        title={resource.name}
        description={RESOURCE_TYPE_LABEL[resource.type]}
        action={
          <Badge variant={RESOURCE_STATUS_BADGE_VARIANT[resource.resourceStatus]}>
            {RESOURCE_STATUS_LABEL[resource.resourceStatus]}
          </Badge>
        }
      />

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-ink-muted">Aforo</dt>
          <dd className="font-medium text-ink">{resource.capacity} personas</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Duración</dt>
          <dd className="font-medium text-ink">{formatBlockDuration(resource.blockMinutes)}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-ink-muted">Horario</dt>
          <dd className="font-display font-medium tabular-nums text-ink">
            {resource.opensAt} – {resource.closesAt}
          </dd>
        </div>
      </dl>

      {resource.requiresApproval ? (
        <Badge variant="warning">Requiere aprobación del administrador</Badge>
      ) : null}

      <Button
        type="button"
        fullWidth
        variant="positive"
        disabled={blocked}
        aria-label={`Reservar ${resource.name}`}
        {...(blocked ? { 'aria-describedby': BLOCK_NOTICE_ID } : {})}
        onClick={onReserve}
      >
        Reservar
      </Button>
    </Card>
  );
}
