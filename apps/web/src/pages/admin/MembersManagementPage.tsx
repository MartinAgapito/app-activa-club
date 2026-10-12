// Socios — US-051 (EP-06, EP-08). Solo lectura.
//
// Pestañas por estado de cuenta (`?tab=`), tabla paginada con "Cargar más",
// búsqueda por DNI exacto y panel lateral con el detalle (`?socio=<memberId>`).
// Contratos: `GET /members?status=`, `GET /members/{id}` y
// `GET /members/lookup?dni=` (docs/api/contratos-api.md §4). Sin edición,
// suspensión ni búsqueda por nombre (preguntas abiertas 1 y 2 de EP-06).

import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import { MemberDetailDrawer } from '../../admin/members/MemberDetailDrawer';
import { MemberDniSearch } from '../../admin/members/MemberDniSearch';
import { MembersList } from '../../admin/members/MembersList';
import { DEFAULT_MEMBERS_TAB, MEMBERS_TABS } from '../../admin/members/members-tabs';

const SELECTED_PARAM = 'socio';

export function MembersManagementPage() {
  const [params, setParams] = useSearchParams();
  const tab = MEMBERS_TABS.find((t) => t.value === params.get('tab')) ?? DEFAULT_MEMBERS_TAB;
  const selectedMemberId = params.get(SELECTED_PARAM);

  function open(memberId: string) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set(SELECTED_PARAM, memberId);
      return next;
    });
  }

  function close() {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.delete(SELECTED_PARAM);
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Socios"
        description="Consulta el padrón por estado de cuenta o busca a un socio por su DNI."
      />

      <MemberDniSearch onFound={open} />

      <Tabs value={tab.value} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList aria-label="Estado de la cuenta">
          {MEMBERS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {MEMBERS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-4">
            <MembersList tab={t} onOpen={open} />
          </TabsContent>
        ))}
      </Tabs>

      <MemberDetailDrawer memberId={selectedMemberId} onClose={close} />
    </div>
  );
}
