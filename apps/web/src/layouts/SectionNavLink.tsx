import { NavLink } from 'react-router-dom';
import { cn } from '@activa-club/ui';

export interface SectionNavLinkProps {
  to: string;
  end?: boolean | undefined;
  children: string;
}

/** Enlace de navegación de sección (socio/administrador) con estado activo accesible. */
export function SectionNavLink({ to, end = false, children }: SectionNavLinkProps) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-brand-100 text-brand-900' : 'text-slate-600 hover:bg-slate-100',
        )
      }
    >
      {children}
    </NavLink>
  );
}
