import { Link, Outlet } from 'react-router-dom';
import { PageLayout } from '@activa-club/ui';

export function PublicLayout() {
  return (
    <PageLayout
      header={
        <nav
          className="container-page flex h-16 items-center justify-between"
          aria-label="Principal"
        >
          <Link to="/" className="text-lg font-semibold text-brand-800">
            Activa Club
          </Link>
          <div className="flex items-center gap-4 text-sm font-medium text-brand-700">
            <Link to="/login" className="hover:text-brand-900">
              Iniciar sesión
            </Link>
            <Link
              to="/registro"
              className="rounded-lg bg-brand-700 px-3 py-2 text-white hover:bg-brand-800"
            >
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
