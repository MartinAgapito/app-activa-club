import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function NotificationsAdminPage() {
  return (
    <UnderConstructionPage
      title="Notificaciones"
      description="Publicación de notificaciones segmentadas y consulta de notificaciones enviadas (RN-NOT-03/04, RN-ADM-06)."
      endpoints={['POST /notifications', 'GET /notifications/sent']}
    />
  );
}
