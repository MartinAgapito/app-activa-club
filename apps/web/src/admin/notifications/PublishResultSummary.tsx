// Resumen en pantalla de una publicación (US-049, criterio 6): cuántos socios
// la recibieron en su bandeja y qué pasó con los correos. `replayed` indica
// que el servidor reconoció una publicación idéntica reciente y no duplicó.

import { forwardRef } from 'react';
import { Badge, Button, Card } from '@activa-club/ui';
import type { CreateNotificationResponse } from '@activa-club/shared-types';

export interface PublishResult {
  response: CreateNotificationResponse;
  title: string;
  segmentLabel: string;
  alsoEmail: boolean;
}

interface PublishResultSummaryProps {
  result: PublishResult;
  onViewSent: () => void;
  onDismiss: () => void;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-control border border-line bg-surface-raised p-3">
      <dt className="type-aux text-ink-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold text-ink">{value}</dd>
    </div>
  );
}

export const PublishResultSummary = forwardRef<HTMLDivElement, PublishResultSummaryProps>(
  function PublishResultSummary({ result, onViewSent, onDismiss }, ref) {
    const { response } = result;
    return (
      <div ref={ref}>
        <Card aria-labelledby="publish-result-title" role="region">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="publish-result-title" className="type-card-title text-ink">
              Notificación publicada
            </h2>
            {response.replayed ? <Badge variant="info">Repetición</Badge> : null}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            “{result.title}” para {result.segmentLabel.toLowerCase()}.
          </p>

          {response.replayed ? (
            <p className="mt-3 rounded-control border border-line bg-surface-brand-soft px-3 py-2 text-sm text-ink">
              Este aviso ya se había publicado hace unos minutos con el mismo texto y destinatarios.
              No se duplicó en las bandejas ni se enviaron correos de nuevo.
            </p>
          ) : null}

          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Socios que lo recibieron" value={response.recipientCount} />
            <Stat label="Correos enviados" value={response.emailsSent} />
            <Stat label="Correos fallidos" value={response.emailsFailed} />
            <Stat label="Correos omitidos" value={response.emailsSkipped} />
          </dl>

          <p className="mt-3 text-sm text-ink-muted">
            {result.alsoEmail
              ? 'Los correos omitidos no se enviaron por el tope de 15 por publicación, el tiempo disponible o la falta de dirección; esos socios sí lo tienen en su bandeja.'
              : 'Se publicó solo en la bandeja de los socios; no se pidió correo.'}
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" onClick={onViewSent}>
              Ver en Enviadas
            </Button>
            <Button type="button" variant="ghost" onClick={onDismiss}>
              Cerrar resumen
            </Button>
          </div>
        </Card>
      </div>
    );
  },
);
