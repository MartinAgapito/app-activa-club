// Socios — US-051 (EP-06, EP-08). Solo lectura.
//
// Pestañas por estado de cuenta (`?tab=`), tabla paginada con "Cargar más",
// búsqueda por DNI exacto y panel lateral con el detalle (`?socio=<memberId>`).
// Filtro por situación de membresía (US-052) en `?membresia=`.
// Contratos: `GET /members?status=&membershipStatus=`, `GET /members/{id}` y
// `GET /members/lookup?dni=` (docs/api/contratos-api.md §4). Sin edición,
// suspensión ni búsqueda por nombre (preguntas abiertas 1 y 2 de EP-06).

import { useId } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@activa-club/ui';
import { MemberDetailDrawer } from '../../admin/members/MemberDetailDrawer';
import { MemberDniSearch } from '../../admin/members/MemberDniSearch';
import { MembersList } from '../../admin/members/MembersList';
import {
  MEMBERSHIP_FILTER_LABELS,
  MEMBERSHIP_FILTER_PARAM,
  MEMBERSHIP_FILTER_VALUES,
  parseMembershipFilter,
} from '../../admin/members/membership-filter';
import { SELECT_CLASS } from '../../admin/shared/select-class';
import { DEFAULT_MEMBERS_TAB, MEMBERS_TABS } from '../../admin/members/members-tabs';

const SELECTED_PARAM = 'socio';

export function MembersManagementPage() {
  const [params, setParams] = useSearchParams();
  const tab = MEMBERS_TABS.find((t) => t.value === params.get('tab')) ?? DEFAULT_MEMBERS_TAB;
  const selectedMemberId = params.get(SELECTED_PARAM);
  const membershipFilter = parseMembershipFilter(params.get(MEMBERSHIP_FILTER_PARAM));
  const filterId = useId();

  function changeTab(next: string) {
    // El filtro por situación de membresía se conserva al cambiar de pestaña.
    setParams(
      membershipFilter ? { tab: next, [MEMBERSHIP_FILTER_PARAM]: membershipFilter } : { tab: next },
      { replace: true },
    );
  }

  function changeFilter(value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (parseMembershipFilter(value)) {
          next.set(MEMBERSHIP_FILTER_PARAM, value);
        } else {
          next.delete(MEMBERSHIP_FILTER_PARAM);
        }
        return next;
      },
      { replace: true },
    );
  }

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

      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <label htmlFor={filterId} className="text-sm font-medium text-ink">
          Situación de la membresía
        </label>
        <select
          id={filterId}
          className={SELECT_CLASS}
          value={membershipFilter ?? ''}
          onChange={(event) => changeFilter(event.target.value)}
        >
          <option value="">Todas</option>
          {MEMBERSHIP_FILTER_VALUES.map((value) => (
            <option key={value} value={value}>
              {MEMBERSHIP_FILTER_LABELS[value]}
            </option>
          ))}
        </select>
      </div>

      <Tabs value={tab.value} onValueChange={changeTab}>
        <TabsList aria-label="Estado de la cuenta">
          {MEMBERS_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {MEMBERS_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value} className="pt-4">
            <MembersList tab={t} membershipStatus={membershipFilter} onOpen={open} />
          </TabsContent>
        ))}
      </Tabs>

      <MemberDetailDrawer memberId={selectedMemberId} onClose={close} />
    </div>
  );
}
