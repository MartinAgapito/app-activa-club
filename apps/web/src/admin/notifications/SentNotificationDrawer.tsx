// Panel de detalle de una notificación enviada (US-049, criterio 1): título,
// mensaje completo, segmento, origen, evento si es automática y conteos.
// No muestra identificadores internos ni datos de destinatarios individuales.

import { Badge, Drawer } from '@activa-club/ui';
import type { SentNotification } from '@activa-club/shared-types';
import { formatDateTimeInLima } from '../../lib/format/lima-time';
import { DetailItem, DetailSection } from '../shared/DetailList';
import { EVENT_LABEL, ORIGIN_LABEL, SEGMENT_LABEL } from './notification-display';

interface SentNotificationDrawerProps {
  /** `null` = cerrado. */
  notification: SentNotification | null;
  resourceNames: ReadonlyMap<string, string>;
  onClose: () => void;
}

function recipientsLabel(
  notification: SentNotification,
  resourceNames: ReadonlyMap<string, string>,
): string {
  if (notification.origin === 'SYSTEM' || notification.segment === null) {
    return 'Socios afectados por el evento';
  }
  if (notification.segment === 'BY_RESOURCE') {
    const name = notification.resourceId ? resourceNames.get(notification.resourceId) : undefined;
    return name
      ? `${SEGMENT_LABEL.BY_RESOURCE}: ${name}`
      : `${SEGMENT_LABEL.BY_RESOURCE} (instalación no disponible)`;
  }
  return SEGMENT_LABEL[notification.segment];
}

export function SentNotificationDrawer({
  notification,
  resourceNames,
  onClose,
}: SentNotificationDrawerProps) {
  return (
    <Drawer
      open={notification !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title={notification?.title ?? 'Detalle de la notificación'}
      description="Detalle de la notificación enviada"
    >
      {notification ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={notification.origin === 'MANUAL' ? 'info' : 'neutral'}>
              {ORIGIN_LABEL[notification.origin]}
            </Badge>
            <Badge variant={notification.alsoEmail ? 'positive' : 'neutral'}>
              {notification.alsoEmail ? 'Con correo' : 'Sin correo'}
            </Badge>
          </div>

          <section aria-label="Mensaje">
            <h3 className="type-card-title text-ink">Mensaje</h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-ink">
              {notification.body}
            </p>
          </section>

          <DetailSection title="Envío">
            <DetailItem label="Fecha (hora de Lima)">
              {formatDateTimeInLima(notification.createdAt)}
            </DetailItem>
            <DetailItem label="Origen">{ORIGIN_LABEL[notification.origin]}</DetailItem>
            <DetailItem label="Segmento">{recipientsLabel(notification, resourceNames)}</DetailItem>
            {notification.event ? (
              <DetailItem label="Evento">{EVENT_LABEL[notification.event]}</DetailItem>
            ) : null}
            <DetailItem label="Socios que lo recibieron">
              {notification.recipientCount === null
                ? 'No disponible'
                : String(notification.recipientCount)}
            </DetailItem>
            <DetailItem label="Correo">
              {notification.alsoEmail ? 'Sí, se pidió enviar también por correo' : 'No'}
            </DetailItem>
          </DetailSection>
        </div>
      ) : null}
    </Drawer>
  );
}
