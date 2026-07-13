import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ResourcesMaintenancePage() {
  return (
    <UnderConstructionPage
      title="Recursos y mantenimiento"
      description="Gestión de aforo, horarios y bloqueos temporales por mantenimiento de cada recurso (RN-RES-11, RN-ADM-04)."
      endpoints={[
        'GET /resources',
        'PATCH /resources/{resourceId}',
        'POST /resources/{resourceId}/maintenance',
        'DELETE /resources/{resourceId}/maintenance/{blockId}',
      ]}
    />
  );
}
