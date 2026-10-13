import { Link } from 'react-router-dom';
import { Activity, CircleDot, Flame, Trophy, Users, Waves, type LucideIcon } from 'lucide-react';
import type { ResourceType } from '@activa-club/shared-types';
import { cn } from '@activa-club/ui';
import { RESOURCE_TYPE_LABEL } from '../lib/format/resource';

const SHORTCUTS: ReadonlyArray<{ type: ResourceType; icon: LucideIcon }> = [
  { type: 'FUTBOL', icon: CircleDot },
  { type: 'PISCINA', icon: Waves },
  { type: 'TENIS', icon: Activity },
  { type: 'PADEL', icon: Trophy },
  { type: 'PARRILLA', icon: Flame },
  { type: 'SALON_SOCIAL', icon: Users },
];

const chipClass =
  'flex min-h-14 flex-col items-center justify-center gap-1 rounded-card border border-line ' +
  'bg-surface-card px-2 py-3 text-center text-ink shadow-card transition-colors focus-ring';

/** Accesos directos por instalación: llevan al flujo de reserva con el tipo
 * preseleccionado (`/socio/reservas?tipo=`). Con `canReserve=false` se
 * muestran deshabilitados (el motivo ya se explica en "Accesos rápidos"). */
export function FacilityShortcutsBlock({ canReserve }: { canReserve?: boolean | undefined }) {
  const blocked = canReserve === false;
  return (
    <section aria-labelledby="instalaciones-titulo" className="flex flex-col gap-3">
      <h2 id="instalaciones-titulo" className="type-section-title text-ink">
        Reservar una instalación
      </h2>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {SHORTCUTS.map(({ type, icon: Icon }) => (
          <li key={type}>
            {blocked ? (
              <button
                type="button"
                disabled
                className={cn(chipClass, 'w-full cursor-not-allowed bg-surface-raised')}
              >
                <Icon className="h-5 w-5 text-ink-disabled" aria-hidden />
                <span className="type-aux text-ink-disabled">{RESOURCE_TYPE_LABEL[type]}</span>
              </button>
            ) : (
              <Link
                to={`/socio/reservas?tipo=${type}`}
                className={cn(chipClass, 'hover:bg-surface-brand-soft')}
              >
                <Icon className="h-5 w-5 text-action" aria-hidden />
                <span className="type-aux font-medium">{RESOURCE_TYPE_LABEL[type]}</span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
