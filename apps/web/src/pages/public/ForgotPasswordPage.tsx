// Recuperar contraseña — US-015.
// Recuperación autoservicio directa contra Amazon Cognito (`ForgotPassword` +
// `ConfirmForgotPassword`, ver docs/api/contratos-api.md §2 y ADR-0002): no
// hay backend propio para este flujo. Por seguridad, solicitar el código
// siempre muestra el mismo mensaje exista o no la cuenta (criterio de
// aceptación 2): el paso 2 (confirmar código + nueva contraseña) se ofrece
// siempre, sin confirmar de ningún modo si el correo estaba registrado.

import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Button, buttonVariants, Card, CardHeader, Input } from '@activa-club/ui';
import {
  CognitoAuthError,
  confirmPasswordReset,
  requestPasswordReset,
  type CognitoAuthErrorReason,
} from '../../auth/cognito-client';
import {
  confirmPasswordResetSchema,
  PASSWORD_REQUIREMENTS,
  requestPasswordResetSchema,
  type ConfirmPasswordResetValues,
  type RequestPasswordResetValues,
} from '../../auth/forgot-password-schema';

const NEUTRAL_REQUEST_MESSAGE =
  'Si el correo está registrado en Activa Club, te enviamos un código de verificación. Revisa tu bandeja de entrada (y spam).';

interface FormError {
  message: string;
  reason: CognitoAuthErrorReason;
}

type Step = 'request' | 'confirm' | 'done';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState('');
  const [requestError, setRequestError] = useState<FormError | null>(null);
  const [confirmError, setConfirmError] = useState<FormError | null>(null);
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const requestForm = useForm<RequestPasswordResetValues>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });

  const confirmForm = useForm<ConfirmPasswordResetValues>({
    resolver: zodResolver(confirmPasswordResetSchema),
    defaultValues: { code: '', newPassword: '' },
  });

  const onRequestSubmit = requestForm.handleSubmit(async (values) => {
    setRequestError(null);
    try {
      await requestPasswordReset(values.email);
      setEmail(values.email);
      setStep('confirm');
    } catch (error) {
      setRequestError(toFormError(error));
    }
  });

  const onConfirmSubmit = confirmForm.handleSubmit(async (values) => {
    setConfirmError(null);
    try {
      await confirmPasswordReset(email, values.code, values.newPassword);
      setStep('done');
    } catch (error) {
      setConfirmError(toFormError(error));
    }
  });

  const onResendCode = async () => {
    setResendStatus('sending');
    setConfirmError(null);
    try {
      await requestPasswordReset(email);
      setResendStatus('sent');
    } catch (error) {
      setResendStatus('idle');
      setConfirmError(toFormError(error));
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        {step === 'request' ? (
          <>
            <CardHeader
              title="Recuperar contraseña"
              description="Ingresa el correo de tu cuenta y te enviaremos un código para restablecer tu contraseña."
            />
            <form className="flex flex-col gap-4" onSubmit={onRequestSubmit} noValidate>
              <Input
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                required
                {...requestForm.register('email')}
                errorMessage={requestForm.formState.errors.email?.message}
              />

              {requestError ? <FormAlert error={requestError} /> : null}

              <Button type="submit" isLoading={requestForm.formState.isSubmitting} fullWidth>
                Enviar código
              </Button>
            </form>
          </>
        ) : null}

        {step === 'confirm' ? (
          <>
            <CardHeader
              title="Confirmar código"
              description={`Ingresa el código enviado a ${email} y elige tu nueva contraseña.`}
            />
            <p
              role="status"
              className="mb-4 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800"
            >
              {NEUTRAL_REQUEST_MESSAGE}
            </p>
            <form className="flex flex-col gap-4" onSubmit={onConfirmSubmit} noValidate>
              <Input
                label="Código de verificación"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                {...confirmForm.register('code')}
                errorMessage={confirmForm.formState.errors.code?.message}
              />
              <div>
                <Input
                  label="Nueva contraseña"
                  type="password"
                  autoComplete="new-password"
                  required
                  {...confirmForm.register('newPassword')}
                  errorMessage={confirmForm.formState.errors.newPassword?.message}
                />
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-xs font-medium text-slate-600">Tu contraseña debe tener:</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-slate-500">
                    {PASSWORD_REQUIREMENTS.map((requirement) => (
                      <li key={requirement}>{requirement}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {confirmError ? (
                <FormAlert error={confirmError}>
                  {confirmError.reason === 'INVALID_RESET_CODE' ? (
                    <button
                      type="button"
                      onClick={onResendCode}
                      disabled={resendStatus === 'sending'}
                      className="mt-1.5 font-medium underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Reenviar código
                    </button>
                  ) : null}
                </FormAlert>
              ) : null}

              {resendStatus === 'sent' ? (
                <p role="status" className="text-sm text-positive-700">
                  Te enviamos un nuevo código si el correo está registrado.
                </p>
              ) : null}

              <Button type="submit" isLoading={confirmForm.formState.isSubmitting} fullWidth>
                Actualizar contraseña
              </Button>
            </form>

            <button
              type="button"
              onClick={() => {
                setStep('request');
                setConfirmError(null);
                setResendStatus('idle');
                confirmForm.reset();
              }}
              className="mt-4 text-center text-sm font-medium text-brand-700 hover:text-brand-900"
            >
              Usar otro correo
            </button>
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <CardHeader
              title="Contraseña actualizada"
              description="Tu contraseña se actualizó correctamente. Ya puedes iniciar sesión con ella."
            />
            <Link to="/login" className={buttonVariants({ fullWidth: true, className: 'mt-2' })}>
              Iniciar sesión
            </Link>
          </>
        ) : null}

        {step !== 'done' ? (
          <p className="mt-6 text-center text-sm text-slate-600">
            <Link to="/login" className="font-medium text-brand-700 hover:text-brand-900">
              Volver a iniciar sesión
            </Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function toFormError(error: unknown): FormError {
  if (error instanceof CognitoAuthError) {
    return { message: error.message, reason: error.reason };
  }
  return { message: 'Ocurrió un error inesperado. Intenta nuevamente.', reason: 'UNKNOWN' };
}

function FormAlert({ error, children }: { error: FormError; children?: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      <p>{error.message}</p>
      {children}
    </div>
  );
}
