import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function NotificationsPage() {
  return (
    <UnderConstructionPage
      title="Notificaciones"
      description="Bandeja de notificaciones internas del socio (RN-NOT-01)."
      endpoints={['GET /notifications', 'POST /notifications/{notificationId}/read']}
    />
  );
}
