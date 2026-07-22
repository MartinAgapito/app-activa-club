// Iniciar sesión — US-014.
// Login directo contra Amazon Cognito (`InitiateAuth` / `USER_PASSWORD_AUTH`,
// ver docs/api/contratos-api.md §2 y ADR-0002). El rol resuelto determina la
// navegación disponible (criterio de aceptación 2).

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, Input } from '@activa-club/ui';
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
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader
          title="Iniciar sesión"
          description="Ingresa con el correo y la contraseña de tu cuenta de Activa Club."
        />
        <form className="flex flex-col gap-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
            {...register('email')}
            errorMessage={errors.email?.message}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            required
            {...register('password')}
            errorMessage={errors.password?.message}
          />

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
            >
              <p>{formError.message}</p>
              {formError.reason === 'USER_NOT_CONFIRMED' ? (
                <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  <Link to="/activar-cuenta" className="font-medium underline underline-offset-2">
                    Activar cuenta con DNI
                  </Link>
                  <Link to="/verificar-correo" className="font-medium underline underline-offset-2">
                    Verificar correo
                  </Link>
                  <Link to="/registro" className="font-medium underline underline-offset-2">
                    Registrarme
                  </Link>
                </p>
              ) : null}
              {formError.reason === 'PASSWORD_RESET_REQUIRED' ? (
                <p className="mt-1.5">
                  <Link
                    to="/recuperar-password"
                    className="font-medium underline underline-offset-2"
                  >
                    Recuperar contraseña
                  </Link>
                </p>
              ) : null}
            </div>
          ) : null}

          <Button type="submit" isLoading={isSubmitting} fullWidth>
            Iniciar sesión
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          ¿No tienes cuenta todavía?{' '}
          <Link to="/registro" className="font-medium text-brand-700 hover:text-brand-900">
            Regístrate
          </Link>
        </p>
        <p className="mt-2 text-center text-sm text-slate-600">
          <Link
            to="/recuperar-password"
            className="font-medium text-brand-700 hover:text-brand-900"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </p>
      </Card>
    </div>
  );
}
