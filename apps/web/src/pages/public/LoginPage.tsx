// Iniciar sesión — US-014 (estilo visual: US-079).
// Login directo contra Amazon Cognito (`InitiateAuth` / `USER_PASSWORD_AUTH`,
// ver docs/api/contratos-api.md §2 y ADR-0002). El rol resuelto determina la
// navegación disponible (criterio de aceptación 2).

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Input } from '@activa-club/ui';
import { AuthAlert, alertLinkClass } from '../../components/auth/AuthFeedback';
import { AuthShell, authLinkClass } from '../../components/auth/AuthShell';
import { useAuth } from '../../auth/AuthContext';
import { CognitoAuthError, type CognitoAuthErrorReason } from '../../auth/cognito-client';
import { loginFormSchema, type LoginFormValues } from '../../auth/login-schema';
import { resolveRedirectPath } from '../../auth/role-routes';

interface LoginFormError {
  message: string;
  reason: CognitoAuthErrorReason;
}

interface LocationState {
  from?: { pathname?: string };
}

export function LoginPage() {
  const { status, role, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState<LoginFormError | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  // Sesión ya iniciada (p. ej. el usuario volvió a /login manualmente): lo
  // dirige directamente a la vista de su rol en vez de mostrar el formulario.
  if (status === 'authenticated' && role) {
    return <Navigate to={resolveRedirectPath(role)} replace />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const nextSession = await signIn(values);
      const fromPath = (location.state as LocationState | null)?.from?.pathname ?? null;
      const resolvedRole = nextSession.role ?? 'member';
      navigate(resolveRedirectPath(resolvedRole, fromPath), { replace: true });
    } catch (error) {
      if (error instanceof CognitoAuthError) {
        setFormError({ message: error.message, reason: error.reason });
      } else {
        setFormError({
          message: 'No se pudo iniciar sesión. Intenta nuevamente.',
          reason: 'UNKNOWN',
        });
      }
    }
  });

  return (
    <AuthShell
      title="Iniciar sesión"
      description="Ingresa con el correo y la contraseña de tu cuenta de Activa Club."
      footer={
        <>
          <p>
            ¿No tienes cuenta todavía?{' '}
            <Link to="/registro" className={authLinkClass}>
              Regístrate
            </Link>
          </p>
          <p>
            ¿Ya eres socio del club?{' '}
            <Link to="/activar-cuenta" className={authLinkClass}>
              Activa tu cuenta con tu DNI
            </Link>
          </p>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
        <Input
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          required
          {...register('email')}
          errorMessage={errors.email?.message}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            {...register('password')}
            errorMessage={errors.password?.message}
          />
          <Link to="/recuperar-password" className={`${authLinkClass} self-end text-sm`}>
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        {formError ? (
          <AuthAlert tone="error">
            <p>{formError.message}</p>
            {formError.reason === 'USER_NOT_CONFIRMED' ? (
              <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                <Link to="/activar-cuenta" className={alertLinkClass}>
                  Activar cuenta con DNI
                </Link>
                <Link to="/verificar-correo" className={alertLinkClass}>
                  Verificar correo
                </Link>
                <Link to="/registro" className={alertLinkClass}>
                  Registrarme
                </Link>
              </p>
            ) : null}
            {formError.reason === 'PASSWORD_RESET_REQUIRED' ? (
              <p className="mt-1.5">
                <Link to="/recuperar-password" className={alertLinkClass}>
                  Recuperar contraseña
                </Link>
              </p>
            ) : null}
          </AuthAlert>
        ) : null}

        <Button type="submit" isLoading={isSubmitting} fullWidth>
          Iniciar sesión
        </Button>
      </form>
    </AuthShell>
  );
}
