// Asistente de reserva en ventana (US-072): reorganiza el flujo de US-032 en
// cuatro pasos dentro de una ventana, sin cambiar sus reglas ni sus contratos.
//
//   1 Instalación -> 2 Día y hora -> 3 Participantes -> 4 Confirmar
//
// Todo el borrador (instalación, día, franja, participantes y notas) vive aquí,
// por lo que "Atrás" conserva lo elegido y un error del servidor puede devolver
// al paso que corresponde sin perder nada. Las reglas críticas las valida el
// servidor (US-030 y US-031): la interfaz las anticipa, pero gana el servidor.

import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Modal, Stepper, buttonVariants, cn } from '@activa-club/ui';
import type {
  AvailabilitySlot,
  CreateReservationResponse,
  Resource,
} from '@activa-club/shared-types';
import { useAuth } from '../auth/AuthContext';
import {
  RESOURCE_STATUS_BADGE_VARIANT,
  RESOURCE_STATUS_LABEL,
  RESOURCE_TYPE_LABEL,
  formatBlockDuration,
} from '../lib/format/resource';
import { getTodayInLima } from '../lib/format/lima-time';
import { useMemberProfileQuery } from '../members/profile-query';
import { useResourceAvailabilityQuery } from '../resources/resources-query';
import { RESERVATION_BLOCK_COPY, getReservationBlock } from './eligibility';
import { DayPicker, SlotGrid } from './AvailabilityPicker';
import {
  maxCompanions,
  participantKey,
  toParticipantInput,
  type DraftParticipant,
} from './participants';
import { ParticipantsSection } from './ParticipantsSection';
import {
  reservationErrorTarget,
  toReservationErrorFeedback,
  type ReservationErrorFeedback,
  type ReservationErrorTarget,
} from './reservation-errors';
import { MY_RESERVATIONS_QUERY_KEY } from './my-reservations-query';
import { MEMBER_DASHBOARD_QUERY_KEY } from '../dashboard/member-dashboard-query';
import { useCreateReservationMutation } from './reservations-query';
import { ReservationErrorAlert, ReservationSummary } from './ReservationSummary';

const WIZARD_STEPS = [
  { id: 'resource', label: 'Instalación' },
  { id: 'slot', label: 'Día y hora' },
  { id: 'participants', label: 'Participantes' },
  { id: 'confirm', label: 'Confirmar' },
] as const;

const STEP_RESOURCE = 0;
const STEP_SLOT = 1;
const STEP_PARTICIPANTS = 2;
const STEP_CONFIRM = 3;

const STEP_HEADING = [
  'Elige la instalación',
  'Elige el día y la hora',
  'Agrega a tus participantes',
  'Revisa y confirma',
];

const TARGET_STEP: Record<ReservationErrorTarget, number> = {
  SLOT: STEP_SLOT,
  PARTICIPANTS: STEP_PARTICIPANTS,
  CONFIRM: STEP_CONFIRM,
};

export interface CompletedReservation {
  resource: Resource;
  response: CreateReservationResponse;
}

export interface ReservationWizardProps {
  open: boolean;
  resources: Resource[];
  /** Instalación preseleccionada: el asistente empieza en el paso 2. */
  initialResourceId?: string | null;
  /** Se invoca al cerrar sin reservar (Escape, Cerrar, Cancelar, Descartar). */
  onClose: () => void;
  /** El servidor creó la reserva (`CONFIRMED` o `PENDING_APPROVAL`). */
  onCompleted: (result: CompletedReservation) => void;
}

export function ReservationWizard({
  open,
  resources,
  initialResourceId = null,
  onClose,
  onCompleted,
}: ReservationWizardProps) {
  const queryClient = useQueryClient();
  const { signOut } = useAuth();
  const profileQuery = useMemberProfileQuery();
  const createMutation = useCreateReservationMutation();

  const initialResource =
    resources.find((resource) => resource.resourceId === initialResourceId) ?? null;

  const [step, setStep] = useState(initialResource ? STEP_SLOT : STEP_RESOURCE);
  const [resourceId, setResourceId] = useState<string | null>(initialResource?.resourceId ?? null);
  const [today] = useState(() => getTodayInLima());
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<AvailabilitySlot | null>(null);
  const [participants, setParticipants] = useState<DraftParticipant[]>([]);
  const [notes, setNotes] = useState('');
  const [submitError, setSubmitError] = useState<ReservationErrorFeedback | null>(null);
  const [errorStep, setErrorStep] = useState<number | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Guarda síncrona contra doble clic (`isSubmitting` se refleja tras el render).
  const inFlightRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const resource = resources.find((item) => item.resourceId === resourceId) ?? null;
  const profile = profileQuery.data;
  const block = profile ? getReservationBlock(profile) : null;

  const availabilityQuery = useResourceAvailabilityQuery(
    resource ? resource.resourceId : null,
    resource ? date : null,
  );

  // La franja solo cuenta si sigue libre en la última disponibilidad: tras un
  // refresco por `RESERVATION_OVERLAP` deja de estar elegida.
  const slotStillFree =
    !slot ||
    !availabilityQuery.data ||
    availabilityQuery.data.slots.some((item) => item.startsAt === slot.startsAt && item.available);
  const selectedSlot = slot && slotStillFree ? slot : null;

  const companionLimit = resource ? maxCompanions(resource.capacity) : Infinity;
  const overCapacity = participants.length > companionLimit;

  const isDirty =
    resourceId !== (initialResource?.resourceId ?? null) ||
    slot !== null ||
    participants.length > 0 ||
    notes.trim().length > 0;

  // Al cambiar de paso (o abrir la confirmación de descarte) el foco va al
  // encabezado: el lector de pantalla anuncia dónde está el socio. Se difiere
  // para ir después del foco inicial que aplica la ventana.
  useEffect(() => {
    const timer = setTimeout(() => headingRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [step, confirmingDiscard]);

  function clearError() {
    setSubmitError(null);
    setErrorStep(null);
  }

  function goTo(next: number) {
    if (isSubmitting) return;
    setStep(next);
  }

  function requestClose() {
    if (isSubmitting) return;
    if (confirmingDiscard) {
      setConfirmingDiscard(false);
      return;
    }
    if (isDirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  function chooseResource(next: Resource) {
    if (next.resourceId === resourceId) return;
    setResourceId(next.resourceId);
    // Cambiar de instalación descarta la franja (otro horario y otra
    // disponibilidad) pero conserva participantes y notas (criterio 7).
    setSlot(null);
    clearError();
  }

  function changeDate(next: string) {
    setDate(next);
    setSlot(null);
    clearError();
  }

  function refreshAvailability(id: string) {
    void queryClient.invalidateQueries({ queryKey: ['resources', id, 'availability'] });
  }

  async function confirm() {
    if (inFlightRef.current || !resource || !selectedSlot || overCapacity) return;
    inFlightRef.current = true;
    setIsSubmitting(true);
    clearError();

    try {
      const trimmedNotes = notes.trim();
      // Sin `endsAt` ni `holderMemberId`: no existen en el contrato de
      // entrada (el servidor calcula el fin y el titular es el autenticado).
      const response = await createMutation.mutateAsync({
        resourceId: resource.resourceId,
        startsAt: selectedSlot.startsAt,
        participants: participants.map(toParticipantInput),
        ...(trimmedNotes ? { notes: trimmedNotes } : {}),
      });
      refreshAvailability(resource.resourceId);
      void queryClient.invalidateQueries({ queryKey: MY_RESERVATIONS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: MEMBER_DASHBOARD_QUERY_KEY });
      onCompleted({ resource, response });
    } catch (error) {
      const feedback = toReservationErrorFeedback(error);
      setSubmitError(feedback);
      const target = reservationErrorTarget(feedback.code);
      setErrorStep(TARGET_STEP[target]);
      setStep(TARGET_STEP[target]);
      if (feedback.refreshAvailability) {
        refreshAvailability(resource.resourceId);
      }
      if (feedback.sessionExpired) {
        // El guard de rutas redirige a /login y, tras autenticarse, devuelve
        // al socio a esta pantalla (mismo criterio que el checkout).
        signOut();
      }
    } finally {
      inFlightRef.current = false;
      setIsSubmitting(false);
    }
  }

  // --- Contenido de cada paso ---

  const errorHere = submitError && errorStep === step ? submitError : null;

  let body;
  if (block) {
    body = (
      <div
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
    );
  } else if (confirmingDiscard) {
    body = (
      <div className="flex flex-col gap-3" role="group" aria-labelledby="wizard-discard-heading">
        <h3
          id="wizard-discard-heading"
          ref={headingRef}
          tabIndex={-1}
          className="type-card-title text-ink focus:outline-none"
        >
          ¿Descartar esta reserva?
        </h3>
        <p className="text-sm text-ink-muted">
          Perderás lo que elegiste hasta ahora: instalación, horario y participantes.
        </p>
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="type-section-title text-ink focus:outline-none"
        >
          {STEP_HEADING[step]}
        </h3>

        {step === STEP_RESOURCE ? (
          <ResourceStep
            resources={resources}
            selectedId={resourceId}
            participantCount={participants.length}
            onSelect={chooseResource}
          />
        ) : null}

        {step === STEP_SLOT && resource ? (
          <section className="flex flex-col gap-4" aria-label="Día y franja horaria">
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink">{resource.name}</span>
              {' · '}Las franjas se muestran en hora del club (America/Lima).
            </p>
            {errorHere ? <ReservationErrorAlert feedback={errorHere} /> : null}
            <DayPicker today={today} value={date} onChange={changeDate} />
            <SlotGrid
              query={availabilityQuery}
              selectedSlotStart={selectedSlot ? selectedSlot.startsAt : null}
              onSelectSlot={(next) => {
                setSlot(next);
                clearError();
              }}
            />
          </section>
        ) : null}

        {step === STEP_PARTICIPANTS && resource ? (
          <section className="flex flex-col gap-4" aria-label="Participantes de la reserva">
            {errorHere ? (
              <ReservationErrorAlert
                feedback={errorHere}
                actions={
                  errorHere.code === 'PARTICIPANT_OVERLAP' ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        clearError();
                        setStep(STEP_SLOT);
                      }}
                    >
                      Elegir otro horario
                    </Button>
                  ) : null
                }
              />
            ) : null}
            <ParticipantsSection
              resourceName={resource.name}
              capacity={resource.capacity}
              participants={participants}
              holderMemberId={profile?.memberId ?? null}
              holderDni={profile?.dni ?? null}
              onAdd={(participant) => {
                clearError();
                setParticipants((current) => [...current, participant]);
              }}
              onRemove={(key) => {
                clearError();
                setParticipants((current) =>
                  current.filter((item) => participantKey(item) !== key),
                );
              }}
            />
            {participants.length === 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="self-start"
                onClick={() => goTo(STEP_CONFIRM)}
              >
                Reservar solo para mí
              </Button>
            ) : null}
          </section>
        ) : null}

        {step === STEP_CONFIRM && resource && selectedSlot ? (
          <section className="flex flex-col gap-4" aria-label="Confirmación de la reserva">
            {errorHere ? (
              <ReservationErrorAlert
                feedback={errorHere}
                actions={
                  errorHere.mayHaveBeenCreated ? (
                    <Link
                      to="/socio/reservas/mias"
                      className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                    >
                      Verificar en Mis reservas
                    </Link>
                  ) : null
                }
              />
            ) : null}
            <ReservationSummary
              resource={resource}
              date={date}
              slot={selectedSlot}
              participants={participants}
              notes={notes}
              onNotesChange={setNotes}
            />
          </section>
        ) : null}

        {step === STEP_CONFIRM && resource && !selectedSlot ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              La franja elegida ya no está disponible. Elige otra para continuar.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => goTo(STEP_SLOT)}
            >
              Elegir otra franja
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  // --- Pie con acciones (siempre visible, también en pantalla completa) ---

  let footer;
  if (block) {
    footer = (
      <Button type="button" variant="secondary" onClick={onClose}>
        Cerrar
      </Button>
    );
  } else if (confirmingDiscard) {
    footer = (
      <div className="flex w-full items-center justify-between gap-2 sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          className="flex-1 sm:flex-none"
          onClick={() => setConfirmingDiscard(false)}
        >
          Seguir reservando
        </Button>
        <Button type="button" variant="danger" className="flex-1 sm:flex-none" onClick={onClose}>
          Descartar
        </Button>
      </div>
    );
  } else {
    const canGoNext =
      (step === STEP_RESOURCE && resource !== null) ||
      (step === STEP_SLOT && selectedSlot !== null) ||
      (step === STEP_PARTICIPANTS && !overCapacity);
    const isLast = step === STEP_CONFIRM;
    const confirmLabel = resource?.requiresApproval
      ? 'Enviar solicitud de reserva'
      : 'Confirmar reserva';

    footer = (
      <div className="flex w-full items-center justify-between gap-2">
        {step === STEP_RESOURCE ? (
          <Button
            type="button"
            variant="secondary"
            className="flex-1 sm:flex-none"
            onClick={requestClose}
          >
            Cancelar
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            className="flex-1 sm:flex-none"
            disabled={isSubmitting}
            onClick={() => goTo(step - 1)}
          >
            Atrás
          </Button>
        )}
        {isLast ? (
          <Button
            type="button"
            variant="positive"
            className="flex-1 sm:flex-none"
            isLoading={isSubmitting}
            disabled={isSubmitting || !selectedSlot || overCapacity}
            onClick={() => void confirm()}
          >
            {isSubmitting ? 'Enviando…' : confirmLabel}
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1 sm:flex-none"
            disabled={!canGoNext}
            onClick={() => goTo(step + 1)}
          >
            Siguiente
          </Button>
        )}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      title="Nueva reserva"
      size="lg"
      dismissible={!isSubmitting}
      footer={footer}
    >
      <div className="flex flex-col gap-5">
        {!block ? (
          <div className="sticky -top-4 z-10 -mx-5 -mt-4 border-b border-line bg-surface-card px-5 py-3">
            <Stepper
              steps={WIZARD_STEPS}
              currentStep={step}
              aria-label="Pasos de la reserva"
              {...(confirmingDiscard || isSubmitting ? {} : { onStepClick: goTo })}
            />
          </div>
        ) : null}
        {body}
      </div>
    </Modal>
  );
}

interface ResourceStepProps {
  resources: Resource[];
  selectedId: string | null;
  participantCount: number;
  onSelect: (resource: Resource) => void;
}

function ResourceStep({ resources, selectedId, participantCount, onSelect }: ResourceStepProps) {
  const selected = resources.find((resource) => resource.resourceId === selectedId) ?? null;
  const exceeds = selected !== null && participantCount > maxCompanions(selected.capacity);

  return (
    <div className="flex flex-col gap-3">
      {exceeds && selected ? (
        <p
          role="status"
          className="rounded-control border border-status-pending bg-status-pending-soft px-3 py-2 text-sm text-ink"
        >
          {`${selected.name} admite hasta ${maxCompanions(selected.capacity)} acompañantes y ya agregaste ${participantCount}. Conservamos tu lista; tendrás que quitar participantes antes de continuar.`}
        </p>
      ) : null}
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {resources.map((resource) => {
          const isSelected = resource.resourceId === selectedId;
          return (
            <li key={resource.resourceId}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(resource)}
                className={cn(
                  'focus-ring flex w-full flex-col gap-2 rounded-card border p-3 text-left transition-colors',
                  isSelected
                    ? 'border-action bg-surface-brand-soft'
                    : 'border-line-strong bg-surface-card hover:bg-surface-brand-soft',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block type-card-title text-ink">{resource.name}</span>
                    <span className="block type-aux text-ink-muted">
                      {RESOURCE_TYPE_LABEL[resource.type]}
                    </span>
                  </span>
                  {isSelected ? <Badge variant="info">✓ Elegida</Badge> : null}
                </span>
                <span className="type-aux text-ink-muted">
                  <span className="tabular-nums">{resource.capacity}</span> personas ·{' '}
                  {formatBlockDuration(resource.blockMinutes)}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant={RESOURCE_STATUS_BADGE_VARIANT[resource.resourceStatus]}>
                    {RESOURCE_STATUS_LABEL[resource.resourceStatus]}
                  </Badge>
                  {resource.requiresApproval ? (
                    <Badge variant="warning">Requiere aprobación</Badge>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
