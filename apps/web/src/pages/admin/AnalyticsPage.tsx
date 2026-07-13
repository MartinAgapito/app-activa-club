import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function AnalyticsPage() {
  return (
    <UnderConstructionPage
      title="Analytics"
      description="Vista extendida de métricas y tendencias operativas (RN-ANL-01..08)."
      endpoints={['GET /dashboard/admin']}
    />
  );
}
