import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function AnalyticsPage() {
  return (
    <UnderConstructionPage
      title="Analytics"
      description="Vista extendida de métricas y tendencias operativas."
      endpoints={['GET /dashboard/admin']}
    />
  );
}
