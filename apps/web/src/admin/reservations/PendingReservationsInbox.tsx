// Bandeja de reservas pendientes de aprobación — US-034 (criterios 1 y 13).
//
// Lista `GET /reservations?scope=all&status=PENDING_APPROVAL` (el servidor
// ordena por inicio ascendente), con contador, detalle de participantes,
// aprobar con confirmación y rechazar exigiendo motivo (3-280). La decisión
// real y las transiciones de estado son del backend: aquí se refleja el
// resultado, incluido el 409 `RESERVATION_NOT_PENDING` cuando otro
// administrador (o el socio) ya actuó.

import { useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Spinner,
  Textarea,
} from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { rejectReservationSchema } from '@activa-club/validation';
import { useAuth } from '../../auth/AuthContext';
import { AdminReservationCard } from './AdminReservationCard';
import { describeReservation } from './reservation-display';
import { toAdminActionFeedback, toAdminLoadError } from './admin-reservations-errors';
import {
  useAdminReservationsQuery,
  useApproveReservationMutation,
  useRefreshAfterReservationChange,
  useRejectReservationMutation,
} from './admin-reservations-query';
import { ReservationNotice, type ReservationNoticeData } from './ReservationNotice';

interface PendingReservationsInboxProps {
  now: Date;
  /** `resourceId` -> nombre de la instalación. */
  resourceNames: ReadonlyMap<string, string>;
}

interface RejectFormValues {
  reason: string;
}

const describe = describeReservation;

export function PendingReservationsInbox({ now, resourceNames }: PendingReservationsInboxProps) {
  const { signOut } = useAuth();
  const refreshAfterChange = useRefreshAfterReservationChange();
  const query = useAdminReservationsQuery({ status: 'PENDING_APPROVAL' });
  const approveMutation = useApproveReservationMutation();
  const rejectMutation = useRejectReservationMutation();

  const [approveTarget, setApproveTarget] = useState<AdminReservationListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminReservationListItem | null>(null);
  const [notice, setNotice] = useState<ReservationNoticeData | null>(null);
  // Guarda síncrona contra doble clic en confirmar.
  const inFlightRef = useRef(false);

  const rejectForm = useForm<RejectFormValues>({
    resolver: zodResolver(rejectReservationSchema),
    defaultValues: { reason: '' },
    mode: 'onChange',
  });
  const reasonValue = useWatch({ control: rejectForm.control, name: 'reason' });
  const isReasonValid = rejectReservationSchema.safeParse({ reason: reasonValue }).success;

  const reservations = query.data?.pages.flatMap((page) => page.items) ?? [];
  const loadError = query.isError ? toAdminLoadError(query.error) : null;

  function handleFailure(error: unknown, action: 'approve' | 'reject', resourceId: string) {
    const feedback = toAdminActionFeedback(error, action);
    setApproveTarget(null);
    setRejectTarget(null);
    setNotice({ type: 'error', title: feedback.title, message: feedback.message });
    if (feedback.refresh) {
      refreshAfterChange(resourceId);
    }
    if (feedback.sessionExpired) {
      signOut();
    }
  }

  async function confirmApprove() {
    if (inFlightRef.current || !approveTarget) {
      return;
    }
    inFlightRef.current = true;
    const target = approveTarget;
    try {
      await approveMutation.mutateAsync(target.reservationId);
      setApproveTarget(null);
      setNotice({
        type: 'success',
        title: 'Solicitud aprobada',
        message: `${describe(target, resourceNames)}. La reserva quedó aprobada y el socio la verá en su lista.`,
      });
      refreshAfterChange(target.resourceId);
    } catch (error) {
      handleFailure(error, 'approve', target.resourceId);
    } finally {
      inFlightRef.current = false;
    }
  }

  async function confirmReject(values: RejectFormValues) {
    if (inFlightRef.current || !rejectTarget) {
      return;
    }
    inFlightRef.current = true;
    const target = rejectTarget;
    try {
      await rejectMutation.mutateAsync({
        reservationId: target.reservationId,
        reason: values.reason,
      });
      setRejectTarget(null);
      rejectForm.reset();
      setNotice({
        type: 'success',
        title: 'Solicitud rechazada',
        message: `${describe(target, resourceNames)}. La franja quedó libre y el socio verá el motivo.`,
      });
      refreshAfterChange(target.resourceId);
    } catch (error) {
      handleFailure(error, 'reject', target.resourceId);
    } finally {
      inFlightRef.current = false;
    }
  }

  const pendingCount = reservations.length;
  const countLabel = query.hasNextPage ? `${pendingCount} o más` : String(pendingCount);

  return (
    <section aria-labelledby="pending-inbox-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pending-inbox-heading" className="text-lg font-semibold text-slate-900">
          Solicitudes pendientes
        </h2>
        {query.data ? (
          <p role="status" className="text-sm font-medium text-slate-700">
            {pendingCount === 0
              ? 'Sin solicitudes pendientes'
              : `${countLabel} ${
                  pendingCount === 1 && !query.hasNextPage
                    ? 'solicitud pendiente'
                    : 'solicitudes pendientes'
                }`}
          </p>
        ) : null}
      </div>
      <p className="text-sm text-slate-600">
        Parrillas y salón social requieren tu aprobación. Se ordenan por fecha de inicio: las más
        próximas primero.
      </p>

      {notice ? <ReservationNotice notice={notice} /> : null}

      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando solicitudes pendientes…" />
        </div>
      ) : null}

      {loadError ? (
        <Card>
          <ErrorState
            title="No pudimos cargar las solicitudes"
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

      {query.data && reservations.length === 0 ? (
        <Card>
          <EmptyState
            title="No hay solicitudes pendientes"
            description="Todas las solicitudes de parrillas y salón social ya fueron resueltas."
          />
        </Card>
      ) : null}

      {reservations.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {reservations.map((reservation) => (
            <li key={reservation.reservationId}>
              <AdminReservationCard
                reservation={reservation}
                resourceName={resourceNames.get(reservation.resourceId) ?? null}
                now={now}
                actions={
                  <>
                    <Button
                      type="button"
                      variant="positive"
                      onClick={() => {
                        setNotice(null);
                        setApproveTarget(reservation);
                      }}
                    >
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => {
                        setNotice(null);
                        rejectForm.reset();
                        setRejectTarget(reservation);
                      }}
                    >
                      Rechazar
                    </Button>
                  </>
                }
              />
            </li>
          ))}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="self-center"
          isLoading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Cargar más
        </Button>
      ) : null}

      <ConfirmDialog
        open={approveTarget !== null}
        title="¿Aprobar esta solicitud?"
        description={
          approveTarget
            ? `${describe(approveTarget, resourceNames)}. La reserva quedará aprobada y mantendrá la franja ocupada.`
            : undefined
        }
        confirmLabel="Aprobar"
        confirmVariant="positive"
        isLoading={approveMutation.isPending}
        onConfirm={() => void confirmApprove()}
        onCancel={() => {
          if (!approveMutation.isPending) {
            setApproveTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        title="¿Rechazar esta solicitud?"
        description={
          rejectTarget
            ? `${describe(rejectTarget, resourceNames)}. La franja quedará libre. Escribe el motivo: el socio lo verá.`
            : undefined
        }
        confirmLabel="Rechazar"
        confirmVariant="danger"
        confirmDisabled={!isReasonValid}
        isLoading={rejectMutation.isPending}
        onConfirm={() => void rejectForm.handleSubmit(confirmReject)()}
        onCancel={() => {
          if (!rejectMutation.isPending) {
            setRejectTarget(null);
          }
        }}
      >
        <Textarea
          label="Motivo del rechazo"
          required
          helpText="Entre 3 y 280 caracteres."
          {...rejectForm.register('reason')}
          errorMessage={
            rejectForm.formState.errors.reason
              ? 'El motivo debe tener entre 3 y 280 caracteres.'
              : undefined
          }
        />
      </ConfirmDialog>
    </section>
  );
}
