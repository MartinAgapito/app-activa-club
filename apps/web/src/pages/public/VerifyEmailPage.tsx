import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function VerifyEmailPage() {
  return (
    <UnderConstructionPage
      title="Verificar correo"
      description="Confirmación de correo electrónico como parte del alta de usuario en Cognito."
      endpoints={['Cognito ConfirmSignUp / verificación de atributo email — ver ADR-0002']}
    />
  );
}
