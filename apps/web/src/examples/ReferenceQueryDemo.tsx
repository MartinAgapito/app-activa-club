// Demo de referencia: TanStack Query + estados de carga/vacío/error/éxito con
// componentes de @activa-club/ui, sobre datos simulados (ver
// reference-membership-plans.ts).

import { Badge, Card, CardHeader, EmptyState, ErrorState, Spinner } from '@activa-club/ui';
import { useReferenceMembershipPlans } from './useReferenceMembershipPlans';

export function ReferenceQueryDemo() {
  const { data, isPending, isError, refetch } = useReferenceMembershipPlans();

  return (
    <Card>
      <CardHeader
        title="Demo de referencia: TanStack Query"
        description="Estados de carga, error y éxito sobre un mock que respeta MembershipPlansResponse."
      />
      {isPending ? <Spinner label="Cargando planes de membresía…" /> : null}
      {isError ? (
        <ErrorState
          description="No se pudieron cargar los planes (simulado)."
          action={
            <button
              type="button"
              onClick={() => void refetch()}
              className="text-sm font-medium text-brand-700 underline"
            >
              Reintentar
            </button>
          }
        />
      ) : null}
      {data && data.plans.length === 0 ? (
        <EmptyState title="No hay planes de membresía disponibles" />
      ) : null}
      {data && data.plans.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.plans.map((plan) => (
            <li
              key={plan.type}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2"
            >
              <span className="text-sm font-medium text-slate-800">{plan.label}</span>
              <Badge variant="positive">
                {(plan.amount / 100).toFixed(2)} {plan.currency}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
