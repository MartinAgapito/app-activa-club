import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function PaymentsPage() {
  return (
    <UnderConstructionPage
      title="Pagos"
      description="Historial de pagos y pago/renovación de membresía con tarjeta vía Stripe test mode."
      endpoints={['GET /memberships/plans', 'POST /payments', 'GET /payments']}
    />
  );
}
