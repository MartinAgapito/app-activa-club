import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { buttonVariants } from '@activa-club/ui';
import { RESERVATION_BLOCK_COPY, getReservationBlock } from '../reservations/eligibility';
import { useMemberProfileQuery } from '../members/profile-query';
import { daysLabel, summarizeMembership } from './membership-summary';
import { useNow } from './useNow';

/** Aviso destacado cuando el socio no puede reservar (deuda o membresía no
 * vigente, RN-PAG-06 / RN-RES-12), o informativo cuando vence pronto. No
 * renderiza nada si no hay nada que avisar o si el perfil no cargó (el bloque
 * de membresía ya muestra ese error). */
export function ReservationBlockNotice() {
  const { data: member } = useMemberProfileQuery();
  const now = useNow();
  if (!member) return null;

  const block = getReservationBlock(member);
  if (block) {
    const copy = RESERVATION_BLOCK_COPY[block];
    return (
      <section
        aria-labelledby="aviso-bloqueo-titulo"
        className="flex flex-col gap-3 rounded-card border border-danger-200 bg-status-problem-soft p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex gap-3">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-problem" aria-hidden />
          <div>
            <h2 id="aviso-bloqueo-titulo" className="type-card-title text-status-problem">
              {copy.title}
            </h2>
            <p className="type-body text-ink">{copy.message}</p>
          </div>
        </div>
        <Link to="/socio/membresia" className={buttonVariants({ variant: 'danger' })}>
          Pagar o renovar membresía
        </Link>
      </section>
    );
  }

  const { action, daysLeft } = summarizeMembership(member, now);
  if (action === 'RENEW' && daysLeft !== null && daysLeft >= 0) {
    return (
      <section
        aria-labelledby="aviso-vencimiento-titulo"
        className="flex flex-col gap-3 rounded-card border border-warning-200 bg-status-pending-soft p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h2 id="aviso-vencimiento-titulo" className="type-card-title text-status-pending">
            Tu membresía vence pronto
          </h2>
          <p className="type-body text-ink">
            {daysLabel(daysLeft)}. Renuévala para seguir reservando sin interrupciones.
          </p>
        </div>
        <Link to="/socio/membresia" className={buttonVariants({ variant: 'secondary' })}>
          Renovar membresía
        </Link>
      </section>
    );
  }
  return null;
}
