// Lista paginada de socios de un estado de cuenta (US-051).

import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge, Button, DataTable, type DataTableColumn } from '@activa-club/ui';
import type { MembershipStatus, MemberSummary } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatCentsAsCurrency } from '../../lib/format/currency';
import { formatDate } from '../../lib/format/date';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../../lib/format/member-status';
import { fetchMembersByStatus } from './members-client';
import { MEMBER_ORIGIN_LABELS, type MembersTab } from './members-tabs';

const COLUMNS: ReadonlyArray<DataTableColumn<MemberSummary>> = [
  {
    key: 'name',
    header: 'Nombre',
    render: (member) => (
      <span className="font-semibold text-ink">
        {member.firstName} {member.lastName}
      </span>
    ),
  },
  { key: 'dni', header: 'DNI', accessor: 'dni' },
  { key: 'origin', header: 'Origen', render: (member) => MEMBER_ORIGIN_LABELS[member.origin] },
  {
    key: 'membership',
    header: 'Membresía',
    render: (member) => (
      <Badge variant={MEMBERSHIP_STATUS_BADGE_VARIANT[member.membershipStatus]}>
        {MEMBERSHIP_STATUS_LABELS[member.membershipStatus]}
      </Badge>
    ),
  },
  {
    key: 'endsAt',
    header: 'Vencimiento',
    render: (member) => (member.membershipEndsAt ? formatDate(member.membershipEndsAt) : '—'),
  },
  {
    key: 'balance',
    header: 'Saldo pendiente',
    align: 'right',
    render: (member) =>
      member.outstandingBalance > 0 ? (
        <span className="font-semibold text-danger-700">
          {formatCentsAsCurrency(member.outstandingBalance, 'PEN')}
        </span>
      ) : (
        '—'
      ),
  },
  { key: 'createdAt', header: 'Fecha de alta', render: (member) => formatDate(member.createdAt) },
];

interface MembersListProps {
  tab: MembersTab;
  /** Situación de membresía elegida (US-052); `undefined` = todas. */
  membershipStatus?: MembershipStatus | undefined;
  onOpen: (memberId: string) => void;
}

export function MembersList({ tab, membershipStatus, onOpen }: MembersListProps) {
  const query = useInfiniteQuery({
    queryKey: ['members', 'list', tab.status, membershipStatus ?? null],
    queryFn: ({ pageParam }) => fetchMembersByStatus(tab.status, pageParam, membershipStatus),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const members = query.data?.pages.flatMap((page) => page.items) ?? [];

  const hasMorePages = Boolean(query.hasNextPage);
  // Una página puede venir vacía con `nextCursor` no nulo (US-052): aún no se
  // sabe si hay coincidencias, así que no se afirma que no existan.
  let emptyTitle = membershipStatus ? 'Ningún socio coincide con el filtro' : tab.emptyTitle;
  let emptyDescription = membershipStatus
    ? 'No hay socios en esta pestaña con esa situación de membresía. Prueba con otra o quita el filtro.'
    : tab.emptyDescription;
  if (hasMorePages) {
    emptyTitle = 'Sin coincidencias en esta página';
    emptyDescription = 'Todavía quedan socios por revisar. Carga más para seguir buscando.';
  }

  return (
    <DataTable
      caption={`Socios: ${tab.label.toLowerCase()}`}
      columns={COLUMNS}
      rows={members}
      getRowKey={(member) => member.memberId}
      onRowClick={(member) => onOpen(member.memberId)}
      getRowLabel={(member) => `Ver el detalle de ${member.firstName} ${member.lastName}`}
      isLoading={query.isPending}
      loadingLabel="Cargando socios…"
      isError={query.isError}
      errorTitle="No pudimos cargar los socios"
      errorDescription={
        query.error instanceof ApiRequestError
          ? query.error.message
          : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
      }
      onRetry={() => void query.refetch()}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      {...(hasMorePages && {
        emptyAction: (
          <Button
            variant="secondary"
            onClick={() => void query.fetchNextPage()}
            isLoading={query.isFetchingNextPage}
          >
            Cargar más
          </Button>
        ),
      })}
      hasMore={hasMorePages}
      onLoadMore={() => void query.fetchNextPage()}
      isLoadingMore={query.isFetchingNextPage}
    />
  );
}
