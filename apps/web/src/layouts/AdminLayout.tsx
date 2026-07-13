import { Link, Outlet } from 'react-router-dom';
import { Badge, PageLayout } from '@activa-club/ui';
import { SectionNavLink } from './SectionNavLink';
import { useAuth } from '../auth/AuthContext';

const ADMIN_LINKS = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/socios', label: 'Socios' },
  { to: '/admin/solicitudes', label: 'Solicitudes' },
  { to: '/admin/membresias', label: 'Membresías' },
  { to: '/admin/reservas', label: 'Reservas' },
  { to: '/admin/recursos', label: 'Recursos' },
  { to: '/admin/notificaciones', label: 'Notificaciones' },
  { to: '/admin/analytics', label: 'Analytics' },
];

export function AdminLayout() {
  const { signOut } = useAuth();

  return (
    <PageLayout
      header={
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="text-lg font-semibold text-brand-800">
              Activa Club
            </Link>
            <Badge variant="neutral">Administrador</Badge>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="text-sm font-medium text-slate-600 hover:text-brand-800"
          >
            Cerrar sesión
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav
          aria-label="Navegación de administración"
          className="flex gap-2 overflow-x-auto pb-2 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {ADMIN_LINKS.map((link) => (
            <SectionNavLink key={link.to} to={link.to} end={link.end}>
              {link.label}
            </SectionNavLink>
          ))}
        </nav>
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </PageLayout>
  );
}
