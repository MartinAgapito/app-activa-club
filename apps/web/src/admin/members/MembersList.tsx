// Lista paginada de socios de un estado de cuenta (US-051).

import { useInfiniteQuery } from '@tanstack/react-query';
import { Badge, DataTable, type DataTableColumn } from '@activa-club/ui';
import type { MemberSummary } from '@activa-club/shared-types';
import { ApiRequestError } from '../../lib/api/http-client';
import { formatDate } from '../../lib/format/date';
import {
  MEMBERSHIP_STATUS_BADGE_VARIANT,
  MEMBERSHIP_STATUS_LABELS,
} from '../../lib/format/member-status';
import { fetchMembersByStatus } from './members-client';
import { MEMBER_ORIGIN_LABELS, type MembersTab } from './members-tabs';

// El listado (`MemberSummary`) no trae vencimiento ni saldo: solo el detalle.
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
  { key: 'createdAt', header: 'Fecha de alta', render: (member) => formatDate(member.createdAt) },
];

interface MembersListProps {
  tab: MembersTab;
  onOpen: (memberId: string) => void;
}

export function MembersList({ tab, onOpen }: MembersListProps) {
  const query = useInfiniteQuery({
    queryKey: ['members', 'list', tab.status],
    queryFn: ({ pageParam }) => fetchMembersByStatus(tab.status, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const members = query.data?.pages.flatMap((page) => page.items) ?? [];

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
      emptyTitle={tab.emptyTitle}
      emptyDescription={tab.emptyDescription}
      hasMore={Boolean(query.hasNextPage)}
      onLoadMore={() => void query.fetchNextPage()}
      isLoadingMore={query.isFetchingNextPage}
    />
  );
}
