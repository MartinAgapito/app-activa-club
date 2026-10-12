// Decisiones administrativas sobre una reserva — US-077 (criterios 5 a 9).
//
// Un solo punto para aprobar (ConfirmDialog), rechazar (Modal con motivo
// obligatorio) y cancelar (ConfirmDialog que aclara que el administrador no
// tiene ventana de 24 h). Lo usan la tabla "Por aprobar" y el panel de detalle.
// El resultado exitoso se avisa con un toast; los errores (409 ya decidida,
// 404, etc.) se muestran dentro de la ventana, con una acción para refrescar.
// La regla de negocio y las transiciones son del backend.

import { useRef, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, ConfirmDialog, Modal, Textarea, useToast } from '@activa-club/ui';
import type { AdminReservationListItem } from '@activa-club/shared-types';
import { rejectReservationSchema } from '@activa-club/validation';
import { useAuth } from '../../auth/AuthContext';
import { toAdminActionFeedback, type AdminReservationFeedback } from './admin-reservations-errors';
import {
  useAdminCancelReservationMutation,
  useApproveReservationMutation,
  useRefreshAfterReservationChange,
  useRejectReservationMutation,
} from './admin-reservations-query';
import { describeReservation } from './reservation-display';
import { ReservationNotice } from './ReservationNotice';

export type ReservationDecisionKind = 'approve' | 'reject' | 'cancel';

/** Campos mínimos de la reserva sobre la que se decide. */
export type ReservationDecisionTarget = Pick<
  AdminReservationListItem,
  | 'reservationId'
  | 'resourceId'
  | 'resourceType'
  | 'startsAt'
  | 'endsAt'
  | 'holder'
  | 'reservationStatus'
>;

interface RejectFormValues {
  reason: string;
}

interface DecisionRequest {
  kind: ReservationDecisionKind;
  reservation: ReservationDecisionTarget;
}

const SUCCESS_MESSAGE: Record<ReservationDecisionKind, string> = {
  approve: 'Reserva aprobada',
  reject: 'Reserva rechazada',
  cancel: 'Reserva cancelada',
};

interface UseReservationDecisionsOptions {
  resourceNames: ReadonlyMap<string, string>;
  /** Se llama tras una decisión exitosa (p. ej. para cerrar el panel de detalle). */
  onDecided?: (kind: ReservationDecisionKind, reservationId: string) => void;
}

export interface ReservationDecisions {
  request: (kind: ReservationDecisionKind, reservation: ReservationDecisionTarget) => void;
  /** Ventanas de confirmación: renderizar una vez en la pantalla. */
  dialogs: ReactNode;
}

export function useReservationDecisions({
  resourceNames,
  onDecided,
}: UseReservationDecisionsOptions): ReservationDecisions {
  const { signOut } = useAuth();
  const toast = useToast();
  const refreshAfterChange = useRefreshAfterReservationChange();
  const approveMutation = useApproveReservationMutation();
  const rejectMutation = useRejectReservationMutation();
  const cancelMutation = useAdminCancelReservationMutation();

  const [current, setCurrent] = useState<DecisionRequest | null>(null);
  const [failure, setFailure] = useState<AdminReservationFeedback | null>(null);
  const [busy, setBusy] = useState(false);
  // Guarda síncrona contra doble clic en confirmar.
  const inFlightRef = useRef(false);

  const rejectForm = useForm<RejectFormValues>({
    resolver: zodResolver(rejectReservationSchema),
    defaultValues: { reason: '' },
    mode: 'onChange',
  });
  const reasonValue = useWatch({ control: rejectForm.control, name: 'reason' });
  const isReasonValid = rejectReservationSchema.safeParse({ reason: reasonValue }).success;

  function request(kind: ReservationDecisionKind, reservation: ReservationDecisionTarget) {
    rejectForm.reset({ reason: '' });
    setFailure(null);
    setCurrent({ kind, reservation });
  }

  function close() {
    if (busy) {
      return;
    }
    setCurrent(null);
    setFailure(null);
  }

  async function execute(reason?: string) {
    if (!current || inFlightRef.current) {
      return;
    }
    // Tras un error que ya refrescó las listas, la acción es "Actualizar".
    if (failure?.refresh) {
      close();
      return;
    }
    inFlightRef.current = true;
    setBusy(true);
    const { kind, reservation } = current;
    try {
      if (kind === 'approve') {
        await approveMutation.mutateAsync(reservation.reservationId);
      } else if (kind === 'reject') {
        await rejectMutation.mutateAsync({
          reservationId: reservation.reservationId,
          reason: reason ?? '',
        });
      } else {
        await cancelMutation.mutateAsync(reservation.reservationId);
      }
      setCurrent(null);
      setFailure(null);
      toast.success(SUCCESS_MESSAGE[kind]);
      refreshAfterChange(reservation.resourceId);
      onDecided?.(kind, reservation.reservationId);
    } catch (error) {
      const feedback = toAdminActionFeedback(error, kind);
      setFailure(feedback);
      if (feedback.refresh) {
        refreshAfterChange(reservation.resourceId);
      }
      if (feedback.sessionExpired) {
        signOut();
      }
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  const reservation = current?.reservation ?? null;
  const summary = reservation ? describeReservation(reservation, resourceNames) : '';
  const failureNotice = failure ? (
    <ReservationNotice notice={{ type: 'error', title: failure.title, message: failure.message }} />
  ) : null;
  const refreshing = failure?.refresh === true;
  const dialogProps = {
    isLoading: busy,
    onCancel: close,
    cancelLabel: failure ? 'Cerrar' : 'Cancelar',
  };

  const dialogs = (
    <>
      <ConfirmDialog
        {...dialogProps}
        open={current !== null && current.kind === 'approve'}
        title="¿Aprobar esta reserva?"
        description={`${summary}. La reserva quedará aprobada y mantendrá la franja ocupada.`}
        confirmLabel={refreshing ? 'Actualizar' : 'Aprobar'}
        confirmVariant={refreshing ? 'primary' : 'positive'}
        onConfirm={() => void execute()}
      >
        {failureNotice}
      </ConfirmDialog>

      <ConfirmDialog
        {...dialogProps}
        open={current !== null && current.kind === 'cancel'}
        title="¿Cancelar esta reserva?"
        description={
          <>
            {summary}. La cancelación administrativa no tiene ventana de 24 horas: puedes cancelar
            aunque falten menos de 24 horas. La franja quedará libre y el cupo mensual del invitado
            se devolverá. Esta acción no se puede deshacer.
            {reservation?.reservationStatus === 'PENDING_APPROVAL' ? (
              <>
                {' '}
                <strong>
                  Esta solicitud está pendiente: si quieres dejar constancia del motivo, lo correcto
                  es rechazarla.
                </strong>
              </>
            ) : null}
          </>
        }
        cancelLabel={failure ? 'Cerrar' : 'Mantener reserva'}
        confirmLabel={refreshing ? 'Actualizar' : 'Sí, cancelar reserva'}
        confirmVariant={refreshing ? 'primary' : 'danger'}
        onConfirm={() => void execute()}
      >
        {failureNotice}
      </ConfirmDialog>

      <Modal
        open={current !== null && current.kind === 'reject'}
        onOpenChange={(next) => {
          if (!next) {
            close();
          }
        }}
        title="Rechazar esta reserva"
        description={`${summary}. La franja quedará libre.`}
        size="md"
        dismissible={!busy}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              {failure ? 'Cerrar' : 'Cancelar'}
            </Button>
            <Button
              variant={refreshing ? 'primary' : 'danger'}
              disabled={!refreshing && !isReasonValid}
              isLoading={busy}
              onClick={() =>
                refreshing
                  ? void execute()
                  : void rejectForm.handleSubmit((values) => execute(values.reason))()
              }
            >
              {refreshing ? 'Actualizar' : 'Rechazar'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {failureNotice}
          {refreshing ? null : (
            <Textarea
              label="Motivo del rechazo"
              required
              helpText="El socio verá este motivo. Entre 3 y 280 caracteres."
              {...rejectForm.register('reason')}
              errorMessage={
                rejectForm.formState.errors.reason
                  ? 'El motivo debe tener entre 3 y 280 caracteres.'
                  : undefined
              }
            />
          )}
        </div>
      </Modal>
    </>
  );

  return { request, dialogs };
}
