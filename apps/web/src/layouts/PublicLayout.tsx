import { Link, Outlet } from 'react-router-dom';
import { buttonVariants, PageLayout } from '@activa-club/ui';

// Cabecera pública (US-079): marca a la izquierda; "Iniciar sesión" como
// enlace de texto y "Crear cuenta" como botón secundario (el botón primario
// de cada vista es el de su contenido, no el de la cabecera).
export function PublicLayout() {
  return (
    <PageLayout
      header={
        <nav
          className="container-page flex h-16 items-center justify-between gap-3"
          aria-label="Principal"
        >
          <Link
            to="/"
            className="rounded-sm font-display text-xl font-semibold tracking-tight text-action focus-ring"
          >
            Activa Club
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              to="/login"
              className="rounded-sm px-1 py-2 text-sm font-medium text-action underline-offset-2 hover:underline focus-ring"
            >
              Iniciar sesión
            </Link>
            <Link to="/registro" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
              Crear cuenta
            </Link>
          </div>
        </nav>
      }
    >
      <Outlet />
    </PageLayout>
  );
}
