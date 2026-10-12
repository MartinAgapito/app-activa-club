import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarCheck, CalendarPlus, CreditCard, type LucideIcon } from 'lucide-react';
import { cn } from '@activa-club/ui';
import { getReservationBlock } from '../reservations/eligibility';
import { useMemberProfileQuery } from '../members/profile-query';

const tileClass =
  'flex min-h-14 items-center gap-3 rounded-card border border-line bg-surface-card px-4 py-3 ' +
  'text-ink shadow-card transition-colors hover:bg-surface-brand-soft focus-ring';

function Tile({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <li>
      <Link to={to} className={tileClass}>
        <Icon className="h-5 w-5 shrink-0 text-action" aria-hidden />
        <span className="type-card-title">{label}</span>
      </Link>
    </li>
  );
}

/** Accesos directos. "Reservar" se deshabilita (nunca se oculta) con el
 * motivo visible cuando el socio no puede reservar. */
export function QuickActionsBlock() {
  const { data: member } = useMemberProfileQuery();
  const blocked = member ? getReservationBlock(member) !== null : false;

  return (
    <section aria-labelledby="accesos-titulo" className="flex flex-col gap-3">
      <h2 id="accesos-titulo" className="type-section-title text-ink">
        Accesos rápidos
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <li>
          {blocked ? (
            <div>
              <button
                type="button"
                disabled
                aria-describedby="reservar-motivo"
                className={cn(tileClass, 'w-full cursor-not-allowed bg-surface-raised text-left')}
              >
                <CalendarPlus className="h-5 w-5 shrink-0 text-ink-disabled" aria-hidden />
                <span className="type-card-title text-ink-disabled">Reservar</span>
              </button>
              <p id="reservar-motivo" className="type-aux mt-1 text-ink-muted">
                No disponible: regulariza tu membresía para reservar.
              </p>
            </div>
          ) : (
            <Link to="/socio/reservas" className={tileClass}>
              <CalendarPlus className="h-5 w-5 shrink-0 text-action" aria-hidden />
              <span className="type-card-title">Reservar</span>
            </Link>
          )}
        </li>
        <Tile to="/socio/reservas/mias" icon={CalendarCheck} label="Mis reservas" />
        <Tile to="/socio/membresia" icon={BadgeCheck} label="Membresía" />
        <Tile to="/socio/pagos" icon={CreditCard} label="Pagos" />
      </ul>
    </section>
  );
}
