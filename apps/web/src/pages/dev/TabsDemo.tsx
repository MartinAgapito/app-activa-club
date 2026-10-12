// Muestra de referencia de Tabs (US-064) para /_dev/design-system.
// Demuestra el modo controlado enlazado a un search param (?tab=...), con
// react-router-dom, sin que el componente de la librería conozca las rutas.

import { Card, CardHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import { useSearchParams } from 'react-router-dom';

const TAB_VALUES = ['proximas', 'pasadas', 'canceladas', 'otras'] as const;

export function TabsDemo() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab = TAB_VALUES.find((v) => v === requested) ?? 'proximas';

  return (
    <Card>
      <CardHeader
        title="Pestañas"
        description="Estado guardado en la URL (?tab=...): sobrevive a recargar y a atrás."
      />
      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList aria-label="Reservas de ejemplo">
          <TabsTrigger value="proximas" count={3}>
            Próximas
          </TabsTrigger>
          <TabsTrigger value="pasadas">Pasadas</TabsTrigger>
          <TabsTrigger value="canceladas" count={12}>
            Canceladas
          </TabsTrigger>
          <TabsTrigger value="otras" disabled>
            Deshabilitada
          </TabsTrigger>
        </TabsList>
        <TabsContent value="proximas">Panel de reservas próximas.</TabsContent>
        <TabsContent value="pasadas">Panel de reservas pasadas.</TabsContent>
        <TabsContent value="canceladas">Panel de reservas canceladas.</TabsContent>
        <TabsContent value="otras">Panel de otras reservas.</TabsContent>
      </Tabs>
    </Card>
  );
}
