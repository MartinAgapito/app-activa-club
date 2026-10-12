// Pestaña "Publicar" de la consola de notificaciones (US-049).
//
// Formulario (título, mensaje, destinatarios, correo) con la validación de
// `createNotificationSchema`; "Revisar y publicar" abre una confirmación con el
// resumen y la advertencia de que no se puede deshacer. El resultado se avisa
// con un toast y un resumen en pantalla. Los errores del contrato se muestran
// sin perder lo escrito. El servidor decide: aquí solo se anticipan validaciones.

import { useEffect, useId, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card, ConfirmDialog, Input, Textarea, useToast } from '@activa-club/ui';
import { useAuth } from '../../auth/AuthContext';
import { usePublishNotificationMutation } from '../../notifications/admin-notifications-query';
import { useResourcesQuery } from '../../resources/resources-query';
import { SELECT_CLASS } from '../shared/select-class';
import { SEGMENT_DESCRIPTION, SEGMENT_LABEL, SEGMENT_OPTIONS } from './notification-display';
import { toLoadError, toPublishFeedback, type PublishFeedback } from './notification-errors';
import {
  BODY_MAX_LENGTH,
  EMAIL_LIMIT,
  EMPTY_NOTIFICATION_FORM,
  TITLE_MAX_LENGTH,
  buildNotificationRequest,
  notificationFormResolver,
  type NotificationFormValues,
} from './notification-form';
import { PublishResultSummary, type PublishResult } from './PublishResultSummary';
import { SingleMemberField, type ResolvedMember } from './SingleMemberField';

interface PublishNotificationSectionProps {
  onViewSent: () => void;
}

/** Lo que se confirma: instantánea del formulario al pulsar "Revisar y publicar". */
interface Review {
  values: NotificationFormValues;
  recipientLabel: string;
}

function ErrorAlert({ feedback }: { feedback: PublishFeedback }) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-control border border-status-problem bg-status-problem-soft p-3 text-sm text-ink"
    >
      <p className="font-semibold">{feedback.title}</p>
      <p>{feedback.message}</p>
    </div>
  );
}

export function PublishNotificationSection({ onViewSent }: PublishNotificationSectionProps) {
  const { signOut } = useAuth();
  const toast = useToast();
  const ids = useId();
  const mutation = usePublishNotificationMutation();
  const inFlight = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);

  const [member, setMember] = useState<ResolvedMember | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [dialogError, setDialogError] = useState<PublishFeedback | null>(null);
  const [formError, setFormError] = useState<PublishFeedback | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);

  const form = useForm<NotificationFormValues>({
    resolver: notificationFormResolver,
    defaultValues: EMPTY_NOTIFICATION_FORM,
    mode: 'onTouched',
  });
  const { errors } = form.formState;
  const segment = useWatch({ control: form.control, name: 'segment' });
  const title = useWatch({ control: form.control, name: 'title' });
  const body = useWatch({ control: form.control, name: 'body' });
  const alsoEmail = useWatch({ control: form.control, name: 'alsoEmail' });

  const resourcesQuery = useResourcesQuery();
  const resources = resourcesQuery.data ?? [];

  useEffect(() => {
    if (result) {
      // El foco vuelve al botón que abrió la confirmación; el resumen, que
      // queda arriba del formulario, se acerca a la vista (móvil).
      resultRef.current?.scrollIntoView?.({ block: 'start' });
    }
  }, [result]);

  useEffect(() => {
    if (formError) {
      formErrorRef.current?.focus();
    }
  }, [formError]);

  function recipientLabelFor(values: NotificationFormValues): string {
    if (values.segment === 'SINGLE') {
      return `Un socio: ${member?.name ?? 'sin confirmar'}`;
    }
    if (values.segment === 'BY_RESOURCE') {
      const name = resources.find((r) => r.resourceId === values.resourceId)?.name;
      return `Titulares de reservas de ${name ?? 'la instalación elegida'}`;
    }
    return SEGMENT_LABEL[values.segment];
  }

  function handleSegmentChange() {
    form.setValue('targetMemberId', '');
    form.setValue('resourceId', '');
    form.clearErrors(['targetMemberId', 'resourceId']);
    setMember(null);
    setFormError(null);
  }

  function handleMemberChange(next: ResolvedMember | null) {
    setMember(next);
    form.setValue('targetMemberId', next?.memberId ?? '');
    form.clearErrors('targetMemberId');
  }

  function openReview(values: NotificationFormValues) {
    setFormError(null);
    setDialogError(null);
    setReview({ values, recipientLabel: recipientLabelFor(values) });
  }

  function closeReview() {
    if (mutation.isPending) {
      return;
    }
    setReview(null);
    setDialogError(null);
  }

  async function confirmPublish() {
    if (!review || inFlight.current) {
      return;
    }
    inFlight.current = true;
    setDialogError(null);
    const { values } = review;
    try {
      const response = await mutation.mutateAsync(buildNotificationRequest(values));
      toast.success(
        response.replayed ? 'Este aviso ya estaba publicado' : 'Notificación publicada',
      );
      setResult({
        response,
        title: values.title.trim(),
        segmentLabel: review.recipientLabel,
        alsoEmail: values.alsoEmail,
      });
      setReview(null);
      setMember(null);
      form.reset(EMPTY_NOTIFICATION_FORM);
    } catch (error) {
      const feedback = toPublishFeedback(error, values.segment);
      if (feedback.sessionExpired) {
        signOut();
      }
      if (feedback.retryable) {
        setDialogError(feedback);
      } else {
        // Error del contrato: se cierra la ventana y se explica en el
        // formulario, con lo escrito intacto para corregir y reintentar.
        setReview(null);
        setFormError(feedback);
      }
    } finally {
      inFlight.current = false;
    }
  }

  const segmentField = form.register('segment');
  const titleLength = title.length;
  const bodyLength = body.length;

  return (
    <section aria-label="Publicar una notificación" className="flex flex-col gap-4">
      {result ? (
        <PublishResultSummary
          ref={resultRef}
          result={result}
          onViewSent={onViewSent}
          onDismiss={() => setResult(null)}
        />
      ) : null}

      <Card>
        <form
          aria-label="Publicar una notificación"
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(event) => void form.handleSubmit(openReview)(event)}
        >
          <Input
            label="Título"
            required
            autoComplete="off"
            helpText={`${titleLength} de ${TITLE_MAX_LENGTH} caracteres`}
            {...form.register('title')}
            errorMessage={errors.title?.message}
          />

          <Textarea
            label="Mensaje"
            required
            rows={5}
            helpText={`${bodyLength} de ${BODY_MAX_LENGTH} caracteres`}
            {...form.register('body')}
            errorMessage={errors.body?.message}
          />

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-semibold text-ink">Destinatarios</legend>
            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${ids}-segment`} className="text-sm font-medium text-ink">
                ¿A quiénes va dirigido?
              </label>
              <select
                id={`${ids}-segment`}
                className={SELECT_CLASS}
                aria-describedby={`${ids}-segment-help`}
                {...segmentField}
                onChange={(event) => {
                  void segmentField.onChange(event);
                  handleSegmentChange();
                }}
              >
                {SEGMENT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {SEGMENT_LABEL[value]}
                  </option>
                ))}
              </select>
              <p id={`${ids}-segment-help`} className="text-sm text-ink-muted">
                {SEGMENT_DESCRIPTION[segment]}
              </p>
            </div>

            {segment === 'SINGLE' ? (
              <SingleMemberField
                member={member}
                onChange={handleMemberChange}
                errorMessage={errors.targetMemberId?.message}
              />
            ) : null}

            {segment === 'BY_RESOURCE' ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${ids}-resource`} className="text-sm font-medium text-ink">
                  Instalación
                  <span className="ml-0.5 text-status-problem" aria-hidden="true">
                    *
                  </span>
                </label>
                {resourcesQuery.isError ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <p role="alert" className="text-status-problem">
                      No pudimos cargar las instalaciones.{' '}
                      {toLoadError(resourcesQuery.error).message}
                    </p>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void resourcesQuery.refetch()}
                    >
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <select
                    id={`${ids}-resource`}
                    className={SELECT_CLASS}
                    disabled={resourcesQuery.isPending}
                    aria-invalid={Boolean(errors.resourceId) || undefined}
                    {...form.register('resourceId')}
                  >
                    <option value="">
                      {resourcesQuery.isPending
                        ? 'Cargando instalaciones…'
                        : 'Elige una instalación'}
                    </option>
                    {resources.map((resource) => (
                      <option key={resource.resourceId} value={resource.resourceId}>
                        {resource.name}
                      </option>
                    ))}
                  </select>
                )}
                {errors.resourceId ? (
                  <p role="alert" className="text-sm text-status-problem">
                    {errors.resourceId.message}
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-ink">
              <input
                type="checkbox"
                className="h-5 w-5 rounded-control border-line-strong accent-action focus-ring"
                aria-describedby={`${ids}-email-help`}
                {...form.register('alsoEmail')}
              />
              Enviar también por correo
            </label>
            <p
              id={`${ids}-email-help`}
              className={
                alsoEmail
                  ? 'rounded-control border border-status-pending bg-status-pending-soft p-3 text-sm text-ink'
                  : 'text-sm text-ink-muted'
              }
            >
              Se envían como máximo {EMAIL_LIMIT} correos por publicación; el resto de los
              destinatarios lo recibe solo en su bandeja. En este entorno el correo únicamente llega
              a direcciones verificadas en SES.
            </p>
          </div>

          {formError ? (
            <div ref={formErrorRef} tabIndex={-1} className="focus:outline-none">
              <ErrorAlert feedback={formError} />
              {formError.sessionExpired ? (
                <Button type="button" variant="secondary" className="mt-2" onClick={signOut}>
                  Iniciar sesión
                </Button>
              ) : null}
            </div>
          ) : null}

          <div>
            <Button type="submit">Revisar y publicar</Button>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={review !== null}
        title="¿Publicar esta notificación?"
        description="Revisa el resumen antes de enviarla a los socios."
        confirmLabel="Publicar ahora"
        cancelLabel="Volver a editar"
        isLoading={mutation.isPending}
        confirmDisabled={mutation.isPending}
        onConfirm={() => void confirmPublish()}
        onCancel={closeReview}
      >
        {review ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-3 text-sm">
              <div>
                <dt className="text-ink-muted">Título</dt>
                <dd className="break-words font-medium text-ink">{review.values.title.trim()}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Mensaje</dt>
                <dd className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-ink">
                  {review.values.body.trim()}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Destinatarios</dt>
                <dd className="font-medium text-ink">{review.recipientLabel}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Correo</dt>
                <dd className="font-medium text-ink">
                  {review.values.alsoEmail
                    ? `Sí, también por correo (hasta ${EMAIL_LIMIT} correos)`
                    : 'No, solo en la bandeja del socio'}
                </dd>
              </div>
            </dl>
            <p className="rounded-control border border-status-pending bg-status-pending-soft p-3 text-sm text-ink">
              Una vez publicada, la notificación no se puede deshacer ni retirar.
            </p>
            {dialogError ? <ErrorAlert feedback={dialogError} /> : null}
          </div>
        ) : null}
      </ConfirmDialog>
    </section>
  );
}
