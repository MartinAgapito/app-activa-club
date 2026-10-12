import { formatDateInLima } from '../lib/format/lima-time';
import { useMemberProfileQuery } from '../members/profile-query';
import { useNow } from './useNow';

/** Saludo con el nombre de pila y la fecha de hoy en hora de Lima. Si el
 * perfil no carga, saluda sin nombre (no bloquea el resto). */
export function GreetingBlock() {
  const profileQuery = useMemberProfileQuery();
  const now = useNow();
  const firstName = profileQuery.data?.firstName.trim().split(/\s+/)[0];

  return (
    <header className="flex flex-col gap-1">
      <h1 className="type-page-title text-ink">{firstName ? `Hola, ${firstName}` : 'Hola'}</h1>
      <p className="type-aux text-ink-muted first-letter:uppercase">
        {formatDateInLima(now.toISOString())}
      </p>
    </header>
  );
}
