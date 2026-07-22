import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();

vi.mock('@aws-sdk/client-cognito-identity-provider', () => {
  class FakeCognitoIdentityProviderClient {
    send = send;
  }
  class FakeCommand {
    input: unknown;
    constructor(input: unknown) {
      this.input = input;
    }
  }
  return {
    CognitoIdentityProviderClient: FakeCognitoIdentityProviderClient,
    AdminCreateUserCommand: class extends FakeCommand {},
    AdminSetUserPasswordCommand: class extends FakeCommand {},
    AdminAddUserToGroupCommand: class extends FakeCommand {},
  };
});

const { createActivationCognitoUser } = await import('./cognito');

describe('createActivationCognitoUser', () => {
  beforeEach(() => {
    send.mockReset();
    process.env['COGNITO_USER_POOL_ID'] = 'test-pool-id';
  });

  it('crea el usuario con contraseña definitiva y lo agrega al grupo member', async () => {
    send
      .mockResolvedValueOnce({
        User: { Attributes: [{ Name: 'sub', Value: 'cognito-sub-1' }] },
      })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});

    const cognitoSub = await createActivationCognitoUser({
      email: 'maria@example.com',
      password: 'Sup3rSecreta!',
    });

    expect(cognitoSub).toBe('cognito-sub-1');
    expect(send).toHaveBeenCalledTimes(3);

    const createInput = send.mock.calls[0]?.[0].input as {
      UserPoolId: string;
      Username: string;
      MessageAction: string;
    };
    expect(createInput.UserPoolId).toBe('test-pool-id');
    expect(createInput.Username).toBe('maria@example.com');
    expect(createInput.MessageAction).toBe('SUPPRESS');

    const passwordInput = send.mock.calls[1]?.[0].input as {
      Password: string;
      Permanent: boolean;
    };
    expect(passwordInput.Password).toBe('Sup3rSecreta!');
    expect(passwordInput.Permanent).toBe(true);

    const groupInput = send.mock.calls[2]?.[0].input as { GroupName: string };
    expect(groupInput.GroupName).toBe('member');
  });

  it('traduce UsernameExistsException a EMAIL_ALREADY_USED (409)', async () => {
    send.mockRejectedValueOnce(
      Object.assign(new Error('ya existe'), { name: 'UsernameExistsException' }),
    );

    await expect(
      createActivationCognitoUser({ email: 'repetido@example.com', password: 'Sup3rSecreta!' }),
    ).rejects.toMatchObject({ code: 'EMAIL_ALREADY_USED' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('propaga otros errores de Cognito sin traducirlos', async () => {
    send.mockRejectedValueOnce(new Error('network error'));

    await expect(
      createActivationCognitoUser({ email: 'maria@example.com', password: 'Sup3rSecreta!' }),
    ).rejects.toThrow('network error');
  });
});
