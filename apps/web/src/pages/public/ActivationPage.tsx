import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ActivationPage() {
  return (
    <UnderConstructionPage
      title="Activar cuenta con DNI"
      description="Verifica el DNI de un socio migrado y completa la creación de su cuenta digital (RN-ACT-01/02/03)."
      endpoints={['POST /activation/verify', 'POST /activation/complete']}
    />
  );
}
