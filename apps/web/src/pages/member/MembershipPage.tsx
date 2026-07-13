import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function MembershipPage() {
  return (
    <UnderConstructionPage
      title="Mi membresía"
      description="Estado, tipo (mensual/anual), vencimiento y saldo pendiente de la membresía (RN-PAG-01..03)."
      endpoints={['GET /members/me', 'PATCH /members/me/auto-renew']}
    />
  );
}
