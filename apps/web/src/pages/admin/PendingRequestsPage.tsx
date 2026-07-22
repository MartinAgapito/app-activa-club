// Solicitudes pendientes de socios nuevos — US-017.
//
// Lista paginada por cursor (`GET /members?status=PENDING`), detalle
// (`GET /members/{memberId}`) y aprobar/rechazar (`POST
// /members/{memberId}/approve|reject`, docs/api/contratos-api.md §4). Ambas
// acciones exigen confirmación explícita (criterio de aceptación 7); rechazar
// además exige un motivo antes de poder confirmar (caso alternativo de la
// historia). Las transiciones de estado y la autorización por rol son
// responsabilidad del backend (criterio 8): esta pantalla solo refleja el
// resultado, incluyendo el caso de que otro administrador ya haya actuado
// sobre la misma solicitud (409 CONFLICT).
//
// El listado (`MemberSummary`) no incluye el correo del contrato — solo el
// detalle completo (`Member`) lo trae, así que el correo se muestra recién al
// seleccionar una solicitud.

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  PageHeader,
  Spinner,
  Textarea,
  cn,
} from '@activa-club/ui';
import type { Member } from '@activa-club/shared-types';
import { rejectMemberSchema } from '@activa-club/validation';
import { ApiRequestError } from '../../lib/api/http-client';
import {
  approveMember,
  fetchMemberDetail,
  fetchPendingMembers,
  rejectMember,
} from '../../admin/pending-members-client';
import { MEMBER_STATUS_BADGE_VARIANT, MEMBER_STATUS_LABELS } from '../../lib/format/member-status';
import { formatDate } from '../../lib/format/date';

const PENDING_LIST_QUERY_KEY: QueryKey = ['members', 'pending'];

function memberDetailQueryKey(memberId: string): QueryKey {
  return ['members', 'detail', memberId];
}

export function PendingRequestsPage() {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitudes pendientes"
        description="Revisa las solicitudes de socios nuevos y decide si aprobarlas o rechazarlas."
      />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 lg:w-96 lg:shrink-0">
          <PendingList selectedMemberId={selectedMemberId} onSelect={setSelectedMemberId} />
        </div>

        <div className="min-w-0 flex-1">
          {selectedMemberId ? (
            <MemberDetailPanel key={selectedMemberId} memberId={selectedMemberId} />
          ) : (
            <Card>
              <EmptyState
                title="Selecciona una solicitud"
                description="Elige un socio de la lista para ver su detalle y decidir si lo apruebas o lo rechazas."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

interface PendingListProps {
  selectedMemberId: string | null;
  onSelect: (memberId: string) => void;
}

function PendingList({ selectedMemberId, onSelect }: PendingListProps) {
  const query = useInfiniteQuery({
    queryKey: PENDING_LIST_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchPendingMembers(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const members = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Card compact>
      <CardHeader title="Pendientes" description="Ordenadas por fecha de solicitud." />

      {query.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" label="Cargando solicitudes…" />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          title="No pudimos cargar las solicitudes"
          description={
            query.error instanceof ApiRequestError
              ? query.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}
        />
      ) : null}

      {query.data && members.length === 0 ? (
        <EmptyState
          title="No hay solicitudes pendientes"
          description="Todas las solicitudes de socios nuevos ya fueron revisadas."
        />
      ) : null}

      {members.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelected = member.memberId === selectedMemberId;
            return (
              <li key={member.memberId}>
                <button
                  type="button"
                  onClick={() => onSelect(member.memberId)}
                  aria-current={isSelected ? 'true' : undefined}
                  className={cn(
                    'flex w-full flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors',
                    isSelected
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/50',
                  )}
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {member.firstName} {member.lastName}
                  </span>
                  <span className="text-xs text-slate-500">DNI {member.dni}</span>
                  <span className="text-xs text-slate-500">
                    Solicitado el {formatDate(member.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {query.hasNextPage ? (
        <Button
          variant="secondary"
          fullWidth
          className="mt-4"
          onClick={() => void query.fetchNextPage()}
          isLoading={query.isFetchingNextPage}
        >
          Cargar más
        </Button>
      ) : null}
    </Card>
  );
}

interface MemberDetailPanelProps {
  memberId: string;
}

type ConfirmAction = 'approve' | 'reject' | null;

interface RejectFormValues {
  reason: string;
}

function MemberDetailPanel({ memberId }: MemberDetailPanelProps) {
  const queryClient = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const detailQueryKey = memberDetailQueryKey(memberId);
  const detailQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => fetchMemberDetail(memberId),
  });

  const rejectForm = useForm<RejectFormValues>({
    resolver: zodResolver(rejectMemberSchema),
    defaultValues: { reason: '' },
    mode: 'onChange',
  });
  const reasonValue = useWatch({ control: rejectForm.control, name: 'reason' });
  const isReasonValid = rejectMemberSchema.safeParse({ reason: reasonValue }).success;

  function handleConflict() {
    setConfirmAction(null);
    setActionMessage({
      type: 'error',
      text: 'Otro administrador ya actualizó esta solicitud. Mostramos el estado actual.',
    });
    void queryClient.invalidateQueries({ queryKey: detailQueryKey });
    void queryClient.invalidateQueries({ queryKey: PENDING_LIST_QUERY_KEY });
  }

  const approveMutation = useMutation({
    mutationFn: () => approveMember(memberId),
    onSuccess: () => {
      setConfirmAction(null);
      setActionMessage({ type: 'success', text: 'Solicitud aprobada correctamente.' });
      void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      void queryClient.invalidateQueries({ queryKey: PENDING_LIST_QUERY_KEY });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === 'CONFLICT') {
        handleConflict();
        return;
      }
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : 'No se pudo aprobar la solicitud. Intenta nuevamente.',
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (values: RejectFormValues) => rejectMember(memberId, { reason: values.reason }),
    onSuccess: () => {
      setConfirmAction(null);
      rejectForm.reset();
      setActionMessage({ type: 'success', text: 'Solicitud rechazada correctamente.' });
      void queryClient.invalidateQueries({ queryKey: detailQueryKey });
      void queryClient.invalidateQueries({ queryKey: PENDING_LIST_QUERY_KEY });
    },
    onError: (error: unknown) => {
      if (error instanceof ApiRequestError && error.code === 'CONFLICT') {
        handleConflict();
        return;
      }
      setActionMessage({
        type: 'error',
        text:
          error instanceof ApiRequestError
            ? error.message
            : 'No se pudo rechazar la solicitud. Intenta nuevamente.',
      });
    },
  });

  if (detailQuery.isPending) {
    return (
      <Card>
        <div className="flex justify-center py-10">
          <Spinner size="lg" label="Cargando el detalle de la solicitud…" />
        </div>
      </Card>
    );
  }

  if (detailQuery.isError) {
    return (
      <Card>
        <ErrorState
          title="No pudimos cargar esta solicitud"
          description={
            detailQuery.error instanceof ApiRequestError
              ? detailQuery.error.message
              : 'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.'
          }
          action={<Button onClick={() => void detailQuery.refetch()}>Reintentar</Button>}
        />
      </Card>
    );
  }

  const member: Member = detailQuery.data;
  const isActionable = member.memberStatus === 'PENDING';

  return (
    <Card>
      <CardHeader
        title={`${member.firstName} ${member.lastName}`}
        description="Detalle de la solicitud"
      />

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">DNI</dt>
          <dd className="mt-1 text-sm text-slate-900">{member.dni}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Correo electrónico
          </dt>
          <dd className="mt-1 text-sm text-slate-900">{member.email}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Teléfono</dt>
          <dd className="mt-1 text-sm text-slate-900">{member.phone ?? 'No registrado'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Fecha de solicitud
          </dt>
          <dd className="mt-1 text-sm text-slate-900">{formatDate(member.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Estado</dt>
          <dd className="mt-1">
            <Badge variant={MEMBER_STATUS_BADGE_VARIANT[member.memberStatus]}>
              {MEMBER_STATUS_LABELS[member.memberStatus]}
            </Badge>
          </dd>
        </div>
        {member.memberStatus === 'REJECTED' && member.rejectionReason ? (
          <div className="sm:col-span-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Motivo de rechazo
            </dt>
            <dd className="mt-1 text-sm text-slate-900">{member.rejectionReason}</dd>
          </div>
        ) : null}
      </dl>

      {actionMessage ? (
        <p
          role={actionMessage.type === 'error' ? 'alert' : 'status'}
          className={cn(
            'mt-4 rounded-lg border px-3 py-2 text-sm',
            actionMessage.type === 'success'
              ? 'border-positive-200 bg-positive-50 text-positive-800'
              : 'border-danger-200 bg-danger-50 text-danger-700',
          )}
        >
          {actionMessage.text}
        </p>
      ) : null}

      {isActionable ? (
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="positive"
            fullWidth
            onClick={() => {
              setActionMessage(null);
              setConfirmAction('approve');
            }}
          >
            Aprobar
          </Button>
          <Button
            variant="danger"
            fullWidth
            onClick={() => {
              setActionMessage(null);
              rejectForm.reset();
              setConfirmAction('reject');
            }}
          >
            Rechazar
          </Button>
        </div>
      ) : (
        <p className="mt-6 text-sm text-slate-500">
          Esta solicitud ya fue resuelta y no admite más acciones.
        </p>
      )}

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title={`¿Aprobar a ${member.firstName} ${member.lastName}?`}
        description="El socio quedará aprobado y podrá continuar con el pago de su primera membresía."
        confirmLabel="Aprobar"
        confirmVariant="positive"
        isLoading={approveMutation.isPending}
        onConfirm={() => approveMutation.mutate()}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'reject'}
        title={`¿Rechazar a ${member.firstName} ${member.lastName}?`}
        description="Ingresa el motivo del rechazo. El socio no podrá continuar con el proceso de alta."
        confirmLabel="Rechazar"
        confirmVariant="danger"
        confirmDisabled={!isReasonValid}
        isLoading={rejectMutation.isPending}
        onConfirm={rejectForm.handleSubmit((values) => rejectMutation.mutate(values))}
        onCancel={() => setConfirmAction(null)}
      >
        <Textarea
          label="Motivo del rechazo"
          required
          {...rejectForm.register('reason')}
          errorMessage={rejectForm.formState.errors.reason?.message}
        />
      </ConfirmDialog>
    </Card>
  );
}
