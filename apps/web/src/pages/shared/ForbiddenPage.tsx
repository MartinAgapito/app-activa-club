import { Link } from 'react-router-dom';
import { ErrorState, buttonVariants } from '@activa-club/ui';

/** Estado "sin permisos" cuando el rol autenticado no puede acceder a la
 * ruta solicitada. El guard de UX vive en RequireRole; la autorización real
 * siempre la valida el backend (ver ADR-0002). */
export function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <ErrorState
        title="No tienes permiso para ver esta sección"
        description="Tu cuenta no tiene el rol necesario para acceder a esta pantalla."
        action={
          <Link to="/" className={buttonVariants({ variant: 'primary' })}>
            Volver al inicio
          </Link>
        }
      />
    </div>
  );
}
