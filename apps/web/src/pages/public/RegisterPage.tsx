import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function RegisterPage() {
  return (
    <UnderConstructionPage
      title="Registro de socio nuevo"
      description="Alta de un socio no migrado; queda en estado pendiente hasta aprobación administrativa (RN-ACT-05/06)."
      endpoints={['POST /registration']}
    />
  );
}
