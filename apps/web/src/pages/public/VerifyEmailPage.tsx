// Verificar correo — alcanzable desde el aviso de error del login cuando
// Cognito responde `UserNotConfirmedException` (ver LoginPage).
//
// En esta versión el producto NO ofrece confirmación de correo por código ni
// reenvío desde la web: las cuentas se habilitan por la activación con DNI
// (socios migrados) o por el registro con aprobación administrativa. Por eso
// esta pantalla solo orienta hacia esos caminos y no promete otra acción.

import { Link } from 'react-router-dom';
import { AuthAlert } from '../../components/auth/AuthFeedback';
import { AuthShell, authLinkClass } from '../../components/auth/AuthShell';

export function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verificar correo"
      description="Tu cuenta todavía no está habilitada para iniciar sesión."
      footer={
        <p>
          ¿Ya puedes ingresar?{' '}
          <Link to="/login" className={authLinkClass}>
            Iniciar sesión
          </Link>
        </p>
      }
    >
      <AuthAlert tone="info">
        <p>
          Por ahora no se confirma el correo desde esta pantalla. Habilita tu cuenta con uno de
          estos caminos:
        </p>
      </AuthAlert>
      <ul className="flex flex-col gap-2 text-sm text-ink">
        <li>
          Si ya eres socio del club,{' '}
          <Link to="/activar-cuenta" className={authLinkClass}>
            activa tu cuenta con tu DNI
          </Link>
          .
        </li>
        <li>
          Si eres nuevo,{' '}
          <Link to="/registro" className={authLinkClass}>
            solicita tu registro
          </Link>
          .
        </li>
      </ul>
    </AuthShell>
  );
}
