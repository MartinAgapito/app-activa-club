// Panel lateral con el contenido completo de una notificación (US-041,
// criterios 7 y 9). Marcarla como leída lo decide la página al abrirla.

import { Link } from 'react-router-dom';
import { Badge, Drawer, buttonVariants } from '@activa-club/ui';
import type { InboxNotification } from '@activa-club/shared-types';
import { formatDateTimeInLima } from '../lib/format/lima-time';
import { linkForEvent } from './notification-event';

export interface NotificationDetailPanelProps {
  notification: InboxNotification | null;
  onClose: () => void;
}

export function NotificationDetailPanel({ notification, onClose }: NotificationDetailPanelProps) {
  const link = notification ? linkForEvent(notification.event) : null;
  return (
    <Drawer
      open={notification !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Notificación"
    >
      {notification ? (
        <article className="flex flex-col gap-4">
          <header className="flex flex-col gap-2">
            <h3 className="font-display text-lg font-semibold text-ink">{notification.title}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <time dateTime={notification.createdAt} className="type-aux text-ink-muted">
                {formatDateTimeInLima(notification.createdAt)}
              </time>
              <Badge variant={notification.readStatus === 'UNREAD' ? 'info' : 'neutral'}>
                {notification.readStatus === 'UNREAD' ? 'No leída' : 'Leída'}
              </Badge>
            </div>
          </header>
          <p className="whitespace-pre-line text-sm text-ink">{notification.body}</p>
          {link ? (
            <Link to={link.to} className={buttonVariants({ variant: 'secondary' }) + ' self-start'}>
              {link.label}
            </Link>
          ) : null}
        </article>
      ) : null}
    </Drawer>
  );
}
