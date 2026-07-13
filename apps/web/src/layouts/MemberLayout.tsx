import { Link, Outlet } from 'react-router-dom';
import { Badge, PageLayout } from '@activa-club/ui';
import { SectionNavLink } from './SectionNavLink';
import { useAuth } from '../auth/AuthContext';

const MEMBER_LINKS = [
  { to: '/socio', label: 'Inicio', end: true },
  { to: '/socio/membresia', label: 'Membresía' },
  { to: '/socio/pagos', label: 'Pagos' },
  { to: '/socio/reservas', label: 'Reservas' },
  { to: '/socio/notificaciones', label: 'Notificaciones' },
  { to: '/socio/perfil', label: 'Perfil' },
];

export function MemberLayout() {
  const { signOut } = useAuth();

  return (
    <PageLayout
      header={
        <div className="container-page flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/socio" className="text-lg font-semibold text-brand-800">
              Activa Club
            </Link>
            <Badge variant="info">Socio</Badge>
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
          aria-label="Navegación de socio"
          className="flex gap-2 overflow-x-auto pb-2 lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-visible lg:pb-0"
        >
          {MEMBER_LINKS.map((link) => (
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
