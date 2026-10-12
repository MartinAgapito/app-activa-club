import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function NotificationsAdminPage() {
  return (
    <UnderConstructionPage
      title="Notificaciones"
      description="Publicación de notificaciones segmentadas y consulta de notificaciones enviadas."
      endpoints={['POST /notifications', 'GET /notifications/sent']}
    />
  );
}
