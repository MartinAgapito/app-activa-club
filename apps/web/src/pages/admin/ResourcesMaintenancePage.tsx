// Recursos y mantenimiento — interfaz administrativa de US-036 (gestión de
// recursos) y US-035 (bloqueos por mantenimiento), reorganizada en pestañas
// en US-075/US-076. La pestaña activa vive en la URL (`?tab=`) para que el
// enlace, el botón Atrás y el acceso rápido del inicio funcionen.

import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import { MaintenanceSection } from '../../admin/maintenance/MaintenanceSection';
import { ResourceManagementSection } from '../../admin/resources/ResourceManagementSection';

const TABS = ['instalaciones', 'mantenimiento'] as const;
type TabValue = (typeof TABS)[number];

function isTab(value: string | null): value is TabValue {
  return TABS.some((tab) => tab === value);
}

export function ResourcesMaintenancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabValue = isTab(tabParam) ? tabParam : 'instalaciones';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recursos y mantenimiento"
        description="Gestiona el aforo, el horario y el estado de las instalaciones, y programa bloqueos por mantenimiento."
      />
      <Tabs
        value={tab}
        // Cambiar de pestaña descarta los parámetros de la anterior (`recurso`).
        onValueChange={(next) => setSearchParams({ tab: next }, { replace: true })}
      >
        <TabsList aria-label="Secciones de recursos y mantenimiento">
          <TabsTrigger value="instalaciones">Instalaciones</TabsTrigger>
          <TabsTrigger value="mantenimiento">Mantenimiento</TabsTrigger>
        </TabsList>
        <TabsContent value="instalaciones">
          <ResourceManagementSection />
        </TabsContent>
        <TabsContent value="mantenimiento">
          <MaintenanceSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
