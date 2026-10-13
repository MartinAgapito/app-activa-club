import { formatDateInLima } from '../lib/format/lima-time';
import { useNow } from './useNow';

/** Saludo con el nombre de pila y la fecha de hoy en hora de Lima. Sin nombre
 * (cargando o con error) saluda de forma genérica. */
export function GreetingBlock({ firstName }: { firstName?: string }) {
  const now = useNow();
  const name = firstName?.trim().split(/\s+/)[0];

  return (
    <header className="flex flex-col gap-1">
      <h1 className="type-page-title text-ink">{name ? `Hola, ${name}` : 'Hola'}</h1>
      <p className="type-aux text-ink-muted first-letter:uppercase">
        {formatDateInLima(now.toISOString())}
      </p>
    </header>
  );
}
