import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function MemberDashboardPage() {
  return (
    <UnderConstructionPage
      title="Inicio"
      description="Resumen personal: estado de membresía, próximas reservas y notificaciones recientes."
      endpoints={['GET /dashboard/member']}
    />
  );
}
