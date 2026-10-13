import { Link } from 'react-router-dom';
import { Badge } from '@activa-club/ui';
import type { MemberDashboardNotification } from '@activa-club/shared-types';

/** Avisos recientes (hasta 5): los no leídos van destacados con texto, no solo
 * con color. Fuente: `GET /dashboard/member`. La bandeja completa es US-041. */
export function RecentNotificationsBlock({
  notifications,
}: {
  notifications: MemberDashboardNotification[];
}) {
  return (
    <section aria-labelledby="avisos-titulo" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="avisos-titulo" className="type-section-title text-ink">
          Avisos recientes
        </h2>
        <Link to="/socio/notificaciones" className="type-aux font-medium text-action underline">
          Ir a mis avisos
        </Link>
      </div>

      {notifications.length === 0 ? (
        <p className="type-body rounded-card border border-dashed border-line-strong bg-surface-card p-5 text-ink-muted">
          No tienes avisos recientes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const unread = notification.readStatus === 'UNREAD';
            return (
              <li key={notification.notificationId}>
                <Link
                  to="/socio/notificaciones"
                  className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface-card px-4 py-3 shadow-card transition-colors hover:bg-surface-brand-soft focus-ring"
                >
                  <span
                    className={
                      unread ? 'type-body font-semibold text-ink' : 'type-body text-ink-muted'
                    }
                  >
                    {notification.title}
                  </span>
                  {unread ? <Badge variant="info">Nueva</Badge> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
