import { UnderConstructionPage } from '../../components/UnderConstructionPage';

export function LoginPage() {
  return (
    <UnderConstructionPage
      title="Iniciar sesión"
      description="Login con correo y contraseña contra Amazon Cognito (RN-ACT-04)."
      endpoints={['Cognito InitiateAuth (USER_PASSWORD_AUTH) — ver ADR-0002']}
    />
  );
}
