// Recursos y mantenimiento — interfaz administrativa de US-036 (gestión de
// recursos) y US-035 (bloqueos por mantenimiento). Cada sección es un
// componente propio compuesto por esta página.

import { PageHeader } from '@activa-club/ui';
import { MaintenanceSection } from '../../admin/maintenance/MaintenanceSection';
import { ResourceManagementSection } from '../../admin/resources/ResourceManagementSection';

export function ResourcesMaintenancePage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Recursos y mantenimiento"
        description="Gestiona el aforo, el horario y el estado de las instalaciones, y programa bloqueos por mantenimiento."
      />
      <ResourceManagementSection />
      <MaintenanceSection />
    </div>
  );
}
