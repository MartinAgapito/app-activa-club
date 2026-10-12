import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function MembersManagementPage() {
  return (
    <UnderConstructionPage
      title="Gestión de socios"
      description="Listado y detalle de socios migrados y nuevos, con su estado de membresía y deuda."
      endpoints={['GET /members', 'GET /members/{memberId}']}
    />
  );
}
