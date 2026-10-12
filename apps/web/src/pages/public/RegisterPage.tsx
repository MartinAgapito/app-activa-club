// Registrarse como socio nuevo — US-016.
// Alta de una persona que no figura en la data on-premise (`POST
// /registration`, docs/api/contratos-api.md §3, RN-ACT-05/06/03): a
// diferencia de US-014/US-015 (Cognito directo), este es un endpoint HTTP
// propio del backend. El socio queda `PENDING` y la interfaz no inicia sesión
// automáticamente (criterio de aceptación 6): debe esperar la aprobación
// administrativa y, luego, pagar su primera membresía (RN-ACT-07).

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
import type { RegistrationRequest } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { registerMember } from '../../auth/registration-client';
import {
  PASSWORD_REQUIREMENTS,
  registerFormSchema,
  type RegisterFormValues,
} from '../../auth/register-schema';

const REGISTER_FIELDS = ['dni', 'email', 'password', 'firstName', 'lastName', 'phone'] as const;
type RegisterField = (typeof REGISTER_FIELDS)[number];

function isRegisterField(field: string): field is RegisterField {
  return (REGISTER_FIELDS as readonly string[]).includes(field);
}

interface RegisterFormError {
  message: string;
  /** DNI ya usado: probablemente sea un socio migrado (RN-ACT-03). US-013
   * (activar cuenta con DNI) todavía no está implementada como flujo
   * completo, así que se orienta con texto, sin enlazar a esa pantalla. */
  showLoginLinks?: boolean;
}

type Step = 'form' | 'success';

/** Mapea el error de `POST /registration` a mensajes de campo (RHF) y al
 * mensaje general del formulario, según el contrato documentado. */
function handleRegisterError(
  error: unknown,
  setError: UseFormSetError<RegisterFormValues>,
): RegisterFormError {
  if (error instanceof ApiRequestError) {
    if (error.code === 'DNI_ALREADY_USED') {
      setError('dni', { message: 'Este DNI ya está registrado.' });
      return {
        message:
          'Este DNI ya está registrado. Si ya eres socio del club, activa tu cuenta con tu DNI en lugar de registrarte de nuevo.',
      };
    }

    if (error.code === 'EMAIL_ALREADY_USED') {
      setError('email', { message: 'Este correo ya está registrado.' });
      return {
        message: 'Este correo ya tiene una cuenta asociada.',
        showLoginLinks: true,
      };
    }

    if (error.code === 'VALIDATION_ERROR') {
      error.details?.forEach((detail) => {
        if (isRegisterField(detail.field)) {
          setError(detail.field, { message: detail.issue });
        }
      });
      return { message: error.message || 'Revisa los datos ingresados e intenta nuevamente.' };
    }

    return { message: error.message || 'No se pudo completar el registro. Intenta nuevamente.' };
  }

  return { message: 'No se pudo completar el registro. Intenta nuevamente.' };
}

export function RegisterPage() {
  const [step, setStep] = useState<Step>('form');
  const [formError, setFormError] = useState<RegisterFormError | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      dni: '',
      email: '',
      password: '',
      firstName: '',
      lastName: '',
      phone: '',
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      // El teléfono es opcional (RegistrationRequest.phone?): se omite del
      // body en vez de enviarlo como `undefined` cuando no se ingresó.
      const { phone, ...required } = values;
      const request: RegistrationRequest = phone ? { ...required, phone } : required;
      await registerMember(request);
      setStep('success');
    } catch (error) {
      setFormError(handleRegisterError(error, setError));
    }
  });

  if (step === 'success') {
    return (
      <AuthShell
        title="Solicitud enviada"
        description="Tu solicitud de registro quedó pendiente de aprobación administrativa. Una vez que un administrador la apruebe, deberás pagar tu primera membresía para quedar activo y poder reservar."
      >
        <AuthAlert tone="success">
          Ya puedes iniciar sesión para revisar el estado de tu solicitud.
        </AuthAlert>
        <Link to="/login" className={buttonVariants({ fullWidth: true })}>
          Iniciar sesión
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Regístrate como socio"
      description="Completa tus datos para solicitar tu ingreso al club. Un administrador revisará tu solicitud antes de que puedas pagar tu primera membresía."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className={authLinkClass}>
            Inicia sesión
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Input
          label="DNI"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          required
          {...register('dni')}
          errorMessage={errors.dni?.message}
        />
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
          errorMessage={errors.email?.message}
        />
        <div>
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            {...register('password')}
            errorMessage={errors.password?.message}
          />
          <PasswordRequirements requirements={PASSWORD_REQUIREMENTS} />
        </div>
        <Input
          label="Nombres"
          type="text"
          autoComplete="given-name"
          required
          {...register('firstName')}
          errorMessage={errors.firstName?.message}
        />
        <Input
          label="Apellidos"
          type="text"
          autoComplete="family-name"
          required
          {...register('lastName')}
          errorMessage={errors.lastName?.message}
        />
        <Input
          label="Teléfono"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          helpText="Opcional."
          {...register('phone')}
          errorMessage={errors.phone?.message}
        />

        {formError ? (
          <AuthAlert tone="error">
            <p>{formError.message}</p>
            {formError.showLoginLinks ? (
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
        ) : null}

        <Button type="submit" isLoading={isSubmitting} fullWidth>
          Crear cuenta
        </Button>
      </form>
    </AuthShell>
  );
}
