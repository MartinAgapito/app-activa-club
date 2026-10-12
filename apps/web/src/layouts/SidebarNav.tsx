import { NavLink } from 'react-router-dom';
import { cn } from '@activa-club/ui';
import type { NavItem } from './navigation';

export interface SidebarNavProps {
  items: NavItem[];
  /** Nombre accesible del `<nav>` (distinto por rol). */
  label: string;
  /** Se invoca al elegir un enlace (el menú móvil se cierra con esto). */
  onNavigate?: () => void;
}

/** Lista de enlaces de navegación con icono y estado activo accesible. */
export function SidebarNav({ items, label, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-1">
        {items.map(({ to, label: text, icon: Icon, end, badge }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end ?? false}
              {...(onNavigate ? { onClick: onNavigate } : {})}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 items-center gap-3 rounded-control px-3 py-2 text-sm transition-colors duration-(--motion-fast) ease-(--motion-ease) focus-ring',
                  isActive
                    ? 'bg-surface-brand-soft font-semibold text-action'
                    : 'font-medium text-ink-muted hover:bg-surface-brand-soft/60 hover:text-ink',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{text}</span>
              {badge !== undefined && badge > 0 ? (
                <span className="rounded-full bg-action px-2 py-0.5 text-xs font-semibold text-ink-on-brand">
                  {badge}
                  <span className="sr-only"> pendientes</span>
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
