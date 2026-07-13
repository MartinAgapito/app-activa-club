import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function AdminDashboardPage() {
  return (
    <UnderConstructionPage
      title="Dashboard administrativo"
      description="Métricas operativas del club: socios, vencimientos, reservas, pagos y ocupación (RN-ANL-01..08)."
      endpoints={['GET /dashboard/admin']}
    />
  );
}
