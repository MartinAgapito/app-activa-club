// Estados de carga y error compartidos por los bloques del inicio (US-070):
// cada bloque los muestra por su cuenta, sin tumbar al resto.

import { Button, Spinner } from '@activa-club/ui';

export function BlockLoading({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-6">
      <Spinner label={label} />
    </div>
  );
}

export function BlockError({
  title,
  onRetry,
  tone = 'light',
}: {
  title: string;
  onRetry: () => void;
  tone?: 'light' | 'dark';
}) {
  return (
    <div
      role="alert"
      className={
        tone === 'dark'
          ? 'flex flex-col items-start gap-3 text-ink-on-brand'
          : 'flex flex-col items-start gap-3 rounded-card border border-danger-200 bg-danger-50 p-4'
      }
    >
      <p className={tone === 'dark' ? 'font-medium' : 'font-medium text-danger-900'}>{title}</p>
      <p className={tone === 'dark' ? 'type-aux opacity-90' : 'type-aux text-danger-700'}>
        El resto del inicio sigue disponible. Intenta nuevamente.
      </p>
      <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  );
}
