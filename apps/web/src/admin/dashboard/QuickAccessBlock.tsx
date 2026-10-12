// Accesos rápidos del inicio del administrador (US-071).

import { Link } from 'react-router-dom';
import { CalendarCheck, UserPlus, Wrench, type LucideIcon } from 'lucide-react';
import { DashboardSection } from './DashboardSection';

interface QuickAccess {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const QUICK_ACCESSES: ReadonlyArray<QuickAccess> = [
  {
    to: '/admin/solicitudes',
    label: 'Solicitudes',
    description: 'Aprobar o rechazar socios nuevos',
    icon: UserPlus,
  },
  {
    to: '/admin/reservas',
    label: 'Reservas',
    description: 'Aprobaciones y consulta de reservas',
    icon: CalendarCheck,
  },
  {
    to: '/admin/recursos',
    label: 'Recursos y mantenimiento',
    description: 'Instalaciones y bloqueos por mantenimiento',
    icon: Wrench,
  },
];

export function QuickAccessBlock() {
  return (
    <DashboardSection title="Accesos rápidos">
      <ul className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACCESSES.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="focus-ring flex h-full items-start gap-3 rounded-card border border-line bg-surface-card p-4 transition-colors duration-(--motion-fast) ease-(--motion-ease) hover:bg-surface-brand-soft"
            >
              <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-action" />
              <span>
                <span className="block type-card-title text-ink">{label}</span>
                <span className="block type-aux text-ink-muted">{description}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}
