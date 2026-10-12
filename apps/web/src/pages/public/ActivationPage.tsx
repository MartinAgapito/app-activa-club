// Activar cuenta de socio migrado con DNI — US-013.
// Flujo en dos pasos (`POST /activation/verify` + `POST /activation/complete`,
// docs/api/contratos-api.md §3, RN-ACT-01/02/03/04): primero se confirma que
// el DNI corresponde a un socio migrado sin cuenta y se muestran datos
// mínimos (nombre, correo enmascarado) para que el socio confirme su
// identidad; luego el socio define el correo y la contraseña con los que
// iniciará sesión (US-014). Si el socio abandona tras `verify`, no se crea
// ningún usuario Cognito ni se modifica el estado del socio (caso
// alternativo de la historia).

import { useState } from 'react';
import { useForm, type UseFormSetError } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Button, buttonVariants, Input } from '@activa-club/ui';
import {
  AuthAlert,
  alertLinkClass,
  PasswordRequirements,
} from '../../components/auth/AuthFeedback';
import { AuthShell, authLinkClass } from '../../components/auth/AuthShell';
import type { CompleteActivationResponse, VerifyDniResponse } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { completeActivation, verifyDni } from '../../auth/activation-client';
import {
  completeActivationFormSchema,
  PASSWORD_REQUIREMENTS,
  verifyDniFormSchema,
  type CompleteActivationFormValues,
  type VerifyDniFormValues,
} from '../../auth/activation-schema';

const COMPLETE_FIELDS = ['email', 'password'] as const;
type CompleteField = (typeof COMPLETE_FIELDS)[number];

function isCompleteField(field: string): field is CompleteField {
  return (COMPLETE_FIELDS as readonly string[]).includes(field);
}

interface FormError {
  message: string;
  /** DNI inexistente en la migración: probablemente sea un socio nuevo. */
  showRegisterLink?: boolean;
  /** DNI/correo ya con cuenta activada: debe iniciar sesión o recuperar su
   * contraseña en lugar de activar de nuevo. */
  showLoginLinks?: boolean;
}

type Step = 'verify' | 'complete' | 'success';

type Identity = Pick<VerifyDniResponse, 'firstName' | 'maskedEmail'>;

function handleVerifyError(
  error: unknown,
  setError: UseFormSetError<VerifyDniFormValues>,
): FormError {
  if (error instanceof ApiRequestError) {
    if (error.code === 'DNI_NOT_FOUND') {
      return {
        message:
          'No encontramos un socio migrado con ese DNI. Si aún no eres socio del club, regístrate como socio nuevo.',
        showRegisterLink: true,
      };
    }

    if (error.code === 'ALREADY_ACTIVATED') {
      return {
        message:
          'Este DNI ya tiene una cuenta digital activada. Inicia sesión o recupera tu contraseña.',
        showLoginLinks: true,
      };
    }

    if (error.code === 'VALIDATION_ERROR') {
      error.details?.forEach((detail) => {
        if (detail.field === 'dni') {
          setError('dni', { message: detail.issue });
        }
      });
      return { message: error.message || 'Revisa el DNI ingresado e intenta nuevamente.' };
    }

    return { message: error.message || 'No se pudo verificar el DNI. Intenta nuevamente.' };
  }

  return { message: 'No se pudo verificar el DNI. Intenta nuevamente.' };
}

function handleCompleteError(
  error: unknown,
  setError: UseFormSetError<CompleteActivationFormValues>,
): FormError {
  if (error instanceof ApiRequestError) {
    if (error.code === 'EMAIL_ALREADY_USED') {
      setError('email', { message: 'Este correo ya está registrado.' });
      return {
        message:
          'Este correo ya tiene una cuenta asociada. Usa otro correo para activar tu cuenta.',
      };
    }

    if (error.code === 'ALREADY_ACTIVATED') {
      return {
        message: 'Este DNI ya fue activado anteriormente. Inicia sesión o recupera tu contraseña.',
        showLoginLinks: true,
      };
    }

    if (error.code === 'DNI_NOT_FOUND') {
      return {
        message:
          'No pudimos completar la activación con este DNI. Vuelve a verificarlo e inténtalo de nuevo.',
      };
    }

    if (error.code === 'VALIDATION_ERROR') {
      error.details?.forEach((detail) => {
        if (isCompleteField(detail.field)) {
          setError(detail.field, { message: detail.issue });
        }
      });
      return { message: error.message || 'Revisa los datos ingresados e intenta nuevamente.' };
    }

    return { message: error.message || 'No se pudo completar la activación. Intenta nuevamente.' };
  }

  return { message: 'No se pudo completar la activación. Intenta nuevamente.' };
}

export function ActivationPage() {
  const [step, setStep] = useState<Step>('verify');
  const [verifiedDni, setVerifiedDni] = useState('');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [verifyError, setVerifyError] = useState<FormError | null>(null);
  const [completeError, setCompleteError] = useState<FormError | null>(null);
  const [activationResult, setActivationResult] = useState<CompleteActivationResponse | null>(null);

  const verifyForm = useForm<VerifyDniFormValues>({
    resolver: zodResolver(verifyDniFormSchema),
    defaultValues: { dni: '' },
  });

  const completeForm = useForm<CompleteActivationFormValues>({
    resolver: zodResolver(completeActivationFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onVerifySubmit = verifyForm.handleSubmit(async (values) => {
    setVerifyError(null);
    try {
      const response = await verifyDni({ dni: values.dni });
      setVerifiedDni(values.dni);
      setIdentity({ firstName: response.firstName, maskedEmail: response.maskedEmail });
      setStep('complete');
    } catch (error) {
      setVerifyError(handleVerifyError(error, verifyForm.setError));
    }
  });

  const onCompleteSubmit = completeForm.handleSubmit(async (values) => {
    setCompleteError(null);
    try {
      const response = await completeActivation({
        dni: verifiedDni,
        email: values.email,
        password: values.password,
      });
      setActivationResult(response);
      setStep('success');
    } catch (error) {
      setCompleteError(handleCompleteError(error, completeForm.setError));
    }
  });

  const backToVerify = () => {
    setStep('verify');
    setIdentity(null);
    setVerifiedDni('');
    setCompleteError(null);
    completeForm.reset();
    verifyForm.reset();
  };

  if (step === 'complete' && identity) {
    return (
      <AuthShell
        title={`Hola, ${identity.firstName}`}
        description={`Confirmamos tu identidad. El correo que tenemos registrado es ${identity.maskedEmail}. Define el correo y la contraseña con los que iniciarás sesión.`}
      >
        <form className="flex flex-col gap-4" onSubmit={onCompleteSubmit} noValidate>
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            {...completeForm.register('email')}
            errorMessage={completeForm.formState.errors.email?.message}
          />
          <div>
            <Input
              label="Contraseña"
              type="password"
              autoComplete="new-password"
              required
              {...completeForm.register('password')}
              errorMessage={completeForm.formState.errors.password?.message}
            />
            <PasswordRequirements requirements={PASSWORD_REQUIREMENTS} />
          </div>

          {completeError ? <FormAlert error={completeError} /> : null}

          <Button type="submit" isLoading={completeForm.formState.isSubmitting} fullWidth>
            Activar cuenta
          </Button>
        </form>

        <Button type="button" variant="ghost" fullWidth onClick={backToVerify}>
          No soy yo, usar otro DNI
        </Button>
      </AuthShell>
    );
  }

  if (step === 'success' && activationResult) {
    return (
      <AuthShell
        title="Cuenta activada"
        description="Tu cuenta se activó correctamente. Ya puedes iniciar sesión con el correo y la contraseña que definiste."
      >
        {activationResult.membershipStatus === 'DEBT' ||
        activationResult.membershipStatus === 'EXPIRED' ? (
          <AuthAlert tone="warning">
            Tu membresía está{' '}
            {activationResult.membershipStatus === 'DEBT' ? 'con deuda' : 'vencida'}. Podrás iniciar
            sesión, pero no podrás reservar hasta regularizar tu pago desde la sección de Pagos.
          </AuthAlert>
        ) : null}
        <Link to="/login" className={buttonVariants({ fullWidth: true })}>
          Iniciar sesión
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Activar cuenta"
      description="Ingresa tu DNI para verificar que ya eres socio del club y activar tu acceso digital."
      footer={
        <p>
          ¿Ya activaste tu cuenta?{' '}
          <Link to="/login" className={authLinkClass}>
            Inicia sesión
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onVerifySubmit} noValidate>
        <Input
          label="DNI"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          required
          {...verifyForm.register('dni')}
          errorMessage={verifyForm.formState.errors.dni?.message}
        />

        {verifyError ? <FormAlert error={verifyError} /> : null}

        <Button type="submit" isLoading={verifyForm.formState.isSubmitting} fullWidth>
          Verificar DNI
        </Button>
      </form>
    </AuthShell>
  );
}

function FormAlert({ error }: { error: FormError }) {
  return (
    <AuthAlert tone="error">
      <p>{error.message}</p>
      {error.showRegisterLink ? (
        <p className="mt-1.5">
          <Link to="/registro" className={alertLinkClass}>
            Registrarme como socio nuevo
          </Link>
        </p>
      ) : null}
      {error.showLoginLinks ? (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          <Link to="/login" className={alertLinkClass}>
            Iniciar sesión
          </Link>
          <Link to="/recuperar-password" className={alertLinkClass}>
            Recuperar contraseña
          </Link>
        </p>
      ) : null}
    </AuthAlert>
  );
}
