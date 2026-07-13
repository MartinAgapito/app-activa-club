import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ProfilePage() {
  return (
    <UnderConstructionPage
      title="Perfil"
      description="Datos propios del socio (teléfono) y preferencia de renovación automática."
      endpoints={['GET /members/me', 'PATCH /members/me']}
    />
  );
}
