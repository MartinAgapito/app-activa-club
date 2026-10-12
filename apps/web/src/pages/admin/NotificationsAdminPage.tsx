// Notificaciones — US-049 (EP-05).
//
// Dos pestañas, con la activa en la URL (`?tab=`): "Publicar" (formulario con
// confirmación, `POST /notifications`) y "Enviadas" (historial paginado,
// `GET /notifications/sent`). Contrato: docs/api/contratos-api.md §8.

import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import { PublishNotificationSection } from '../../admin/notifications/PublishNotificationSection';
import { SentNotificationsSection } from '../../admin/notifications/SentNotificationsSection';

const TAB_VALUES = ['publicar', 'enviadas'] as const;
type NotificationsTab = (typeof TAB_VALUES)[number];

export function NotificationsAdminPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: NotificationsTab = TAB_VALUES.find((value) => value === requested) ?? 'publicar';

  function changeTab(next: string) {
    setParams(next === 'publicar' ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notificaciones"
        description="Publica avisos para los socios y consulta lo que se envió y a cuántos llegó."
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="Vistas de notificaciones">
          <TabsTrigger value="publicar">Publicar</TabsTrigger>
          <TabsTrigger value="enviadas">Enviadas</TabsTrigger>
        </TabsList>

        {/* Montada siempre (oculta si no está activa): cambiar de pestaña no
            pierde lo que el administrador ya escribió. */}
        <TabsContent value="publicar" forceMount className="pt-4">
          <PublishNotificationSection onViewSent={() => changeTab('enviadas')} />
        </TabsContent>
        <TabsContent value="enviadas" className="pt-4">
          <SentNotificationsSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
