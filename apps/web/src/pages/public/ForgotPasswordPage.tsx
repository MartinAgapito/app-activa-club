import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function ForgotPasswordPage() {
  return (
    <UnderConstructionPage
      title="Recuperar contraseña"
      description="Flujo de recuperación de contraseña gestionado por Amazon Cognito."
      endpoints={['Cognito ForgotPassword + ConfirmForgotPassword — ver ADR-0002']}
    />
  );
}
