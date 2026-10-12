// Solicitudes pendientes de socios nuevos — US-017, rehecha en US-078.
//
// Patrón común del administrador: lista (DataTable) -> panel lateral con el
// detalle (Drawer, dirección propia `?solicitud=<memberId>`) -> decisión en
// ventana (ConfirmDialog / Modal) -> aviso efímero (Toast).
//
// Contratos (docs/api/contratos-api.md §4): `GET /members?status=PENDING`
// (paginada por cursor), `GET /members/{memberId}`, `POST
// /members/{memberId}/approve` y `POST /members/{memberId}/reject` (con
// `reason`). Las transiciones de estado y la autorización por rol son
// responsabilidad del backend: esta pantalla solo refleja el resultado,
// incluido el 409 CONFLICT cuando otro administrador ya decidió.
//
// El listado (`MemberSummary`) no incluye correo ni teléfono: solo el detalle
// completo (`Member`) los trae.

import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from '@tanstack/react-query';
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  ErrorState,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@activa-club/ui';
import type { Member, MemberSummary, Paginated } from '@activa-club/shared-types';
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
// Prefijo del dashboard administrativo: invalida el contador de pendientes.
const ADMIN_DASHBOARD_QUERY_KEY: QueryKey = ['dashboard'];
const SELECTED_PARAM = 'solicitud';

function memberDetailQueryKey(memberId: string): QueryKey {
  return ['members', 'detail', memberId];
}

const CONFLICT_MESSAGE =
  'Otro administrador ya actualizó esta solicitud. Actualiza para ver su estado actual.';

type DecisionDialog = 'approve' | 'reject' | null;

interface RejectFormValues {
  reason: string;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError ? error.message : fallback;
}

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
  {
    key: 'createdAt',
    header: 'Fecha de solicitud',
    render: (member) => formatDate(member.createdAt),
  },
  {
    key: 'status',
    header: 'Estado',
    render: (member) => (
      <Badge variant={MEMBER_STATUS_BADGE_VARIANT[member.memberStatus]}>
        {MEMBER_STATUS_LABELS[member.memberStatus]}
      </Badge>
    ),
  },
];

export function PendingRequestsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedMemberId = searchParams.get(SELECTED_PARAM);

  const query = useInfiniteQuery({
    queryKey: PENDING_LIST_QUERY_KEY,
    queryFn: ({ pageParam }) => fetchPendingMembers(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });

  const members = query.data?.pages.flatMap((page) => page.items) ?? [];

  function select(memberId: string) {
    const next = new URLSearchParams(searchParams);
    next.set(SELECTED_PARAM, memberId);
    setSearchParams(next);
  }

  function closePanel() {
    const next = new URLSearchParams(searchParams);
    next.delete(SELECTED_PARAM);
    setSearchParams(next);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Solicitudes pendientes"
        description="Revisa las solicitudes de socios nuevos y decide si aprobarlas o rechazarlas."
      />

      <DataTable
        caption="Solicitudes pendientes, de la más antigua a la más reciente"
        columns={COLUMNS}
        rows={members}
        getRowKey={(member) => member.memberId}
        onRowClick={(member) => select(member.memberId)}
        getRowLabel={(member) => `Revisar solicitud de ${member.firstName} ${member.lastName}`}
        isLoading={query.isPending}
        loadingLabel="Cargando solicitudes…"
        isError={query.isError}
        errorTitle="No pudimos cargar las solicitudes"
        errorDescription={errorText(
          query.error,
          'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
        )}
        onRetry={() => void query.refetch()}
        emptyTitle="No hay solicitudes pendientes"
        emptyDescription="Todas las solicitudes de socios nuevos ya fueron revisadas."
        hasMore={Boolean(query.hasNextPage)}
        onLoadMore={() => void query.fetchNextPage()}
        isLoadingMore={query.isFetchingNextPage}
      />

      {selectedMemberId ? <RequestPanel memberId={selectedMemberId} onClose={closePanel} /> : null}
    </div>
  );
}

interface RequestPanelProps {
  memberId: string;
  onClose: () => void;
}

function RequestPanel({ memberId, onClose }: RequestPanelProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<DecisionDialog>(null);
  // Error mostrado dentro de la ventana de decisión abierta.
  const [dialogError, setDialogError] = useState<{ text: string; conflict: boolean } | null>(null);

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

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: detailQueryKey });
    void queryClient.invalidateQueries({ queryKey: PENDING_LIST_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ADMIN_DASHBOARD_QUERY_KEY });
  }

  function openDialog(next: Exclude<DecisionDialog, null>) {
    setDialogError(null);
    if (next === 'reject') rejectForm.reset();
    setDialog(next);
  }

  function closeDialog() {
    // Tras un conflicto, la lista y el detalle se refrescan al cerrar.
    if (dialogError?.conflict) refreshAll();
    setDialog(null);
    setDialogError(null);
  }

  function handleDecided(message: string) {
    // La solicitud sale de la lista al instante, sin esperar al refetch.
    queryClient.setQueryData<InfiniteData<Paginated<MemberSummary>, string | null>>(
      PENDING_LIST_QUERY_KEY,
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.memberId !== memberId),
          })),
        },
    );
    refreshAll();
    setDialog(null);
    setDialogError(null);
    toast.success(message);
    onClose();
  }

  function handleError(error: unknown, fallback: string) {
    if (error instanceof ApiRequestError && error.code === 'CONFLICT') {
      setDialogError({ text: CONFLICT_MESSAGE, conflict: true });
      return;
    }
    setDialogError({ text: errorText(error, fallback), conflict: false });
  }

  const approveMutation = useMutation({
    mutationFn: () => approveMember(memberId),
    onSuccess: () => handleDecided('Solicitud aprobada'),
    onError: (error: unknown) =>
      handleError(error, 'No se pudo aprobar la solicitud. Intenta nuevamente.'),
  });

  const rejectMutation = useMutation({
    mutationFn: (values: RejectFormValues) => rejectMember(memberId, { reason: values.reason }),
    onSuccess: () => handleDecided('Solicitud rechazada'),
    onError: (error: unknown) =>
      handleError(error, 'No se pudo rechazar la solicitud. Intenta nuevamente.'),
  });

  const member: Member | undefined = detailQuery.data;
  const isActionable = member?.memberStatus === 'PENDING';
  const fullName = member ? `${member.firstName} ${member.lastName}` : '';

  const errorAlert = dialogError ? (
    <p
      role="alert"
      className="rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700"
    >
      {dialogError.text}
    </p>
  ) : null;

  return (
    <>
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
        title={member ? fullName : 'Solicitud de socio'}
        description="Detalle de la solicitud"
        footer={
          isActionable ? (
            <>
              <Button variant="danger" onClick={() => openDialog('reject')}>
                Rechazar
              </Button>
              <Button variant="positive" onClick={() => openDialog('approve')}>
                Aprobar
              </Button>
            </>
          ) : undefined
        }
      >
        {detailQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" label="Cargando el detalle de la solicitud…" />
          </div>
        ) : detailQuery.isError ? (
          <ErrorState
            title="No pudimos cargar esta solicitud"
            description={errorText(
              detailQuery.error,
              'Ocurrió un error inesperado. Intenta nuevamente en unos minutos.',
            )}
            action={<Button onClick={() => void detailQuery.refetch()}>Reintentar</Button>}
          />
        ) : member ? (
          <div className="flex flex-col gap-6">
            <DetailSection title="Datos de contacto">
              <DetailItem label="Correo electrónico">{member.email}</DetailItem>
              <DetailItem label="Teléfono">{member.phone ?? 'No registrado'}</DetailItem>
            </DetailSection>

            <DetailSection title="Datos de registro">
              <DetailItem label="DNI">{member.dni}</DetailItem>
              <DetailItem label="Fecha de solicitud">{formatDate(member.createdAt)}</DetailItem>
              <DetailItem label="Estado">
                <Badge variant={MEMBER_STATUS_BADGE_VARIANT[member.memberStatus]}>
                  {MEMBER_STATUS_LABELS[member.memberStatus]}
                </Badge>
              </DetailItem>
              {member.memberStatus === 'REJECTED' && member.rejectionReason ? (
                <DetailItem label="Motivo de rechazo" wide>
                  {member.rejectionReason}
                </DetailItem>
              ) : null}
            </DetailSection>

            {isActionable ? null : (
              <p className="text-sm text-ink-muted">
                Esta solicitud ya fue resuelta y no admite más acciones.
              </p>
            )}
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={dialog === 'approve'}
        title={`¿Aprobar a ${fullName}?`}
        description="El socio quedará aprobado y deberá pagar su primera membresía para quedar activo."
        confirmLabel="Aprobar"
        confirmVariant="positive"
        cancelLabel={dialogError?.conflict ? 'Actualizar' : 'Cancelar'}
        confirmDisabled={Boolean(dialogError?.conflict)}
        isLoading={approveMutation.isPending}
        onConfirm={() => {
          setDialogError(null);
          approveMutation.mutate();
        }}
        onCancel={closeDialog}
      >
        {errorAlert}
      </ConfirmDialog>

      <Modal
        open={dialog === 'reject'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
        role="alertdialog"
        size="sm"
        showCloseButton={false}
        title={`¿Rechazar a ${fullName}?`}
        description="Ingresa el motivo del rechazo. El socio no podrá continuar con el proceso de alta."
        footer={
          <>
            <Button variant="secondary" onClick={closeDialog} disabled={rejectMutation.isPending}>
              {dialogError?.conflict ? 'Actualizar' : 'Cancelar'}
            </Button>
            <Button
              type="submit"
              form="reject-request-form"
              variant="danger"
              disabled={!isReasonValid || Boolean(dialogError?.conflict)}
              isLoading={rejectMutation.isPending}
            >
              Rechazar
            </Button>
          </>
        }
      >
        <form
          id="reject-request-form"
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void rejectForm.handleSubmit((values) => {
              setDialogError(null);
              rejectMutation.mutate(values);
            })(event);
          }}
        >
          <Textarea
            label="Motivo del rechazo"
            required
            {...rejectForm.register('reason')}
            errorMessage={rejectForm.formState.errors.reason?.message}
          />
          {errorAlert}
        </form>
      </Modal>
    </>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="type-card-title text-ink">{title}</h3>
      <dl className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

function DetailItem({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="type-aux text-ink-muted">{label}</dt>
      <dd className="mt-1 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}
