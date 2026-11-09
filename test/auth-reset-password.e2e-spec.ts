import { EmailCode } from '../src/entities/email-code.entity.js';
import { User } from '../src/entities/user.entity.js';
import { AuthClient, UserErrorEnum } from '../src/types/auth.type.js';
import { Provider } from '../src/types/user.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import {
  createUser,
  lastCode,
  login,
  loginWeb,
  mailsTo,
} from './utils/fixtures.js';

const NEW_PASSWORD = 'brand-new-Passw0rd';

describe('password reset', () => {
  let testApp: TestApp;

  const forgot = (email: string) =>
    testApp.http().post('/api/auth/forgot-password').send({ email });

  const reset = (email: string, code: string) =>
    testApp
      .http()
      .post('/api/auth/reset-password')
      .send({ email, code, newPassword: NEW_PASSWORD });

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('sets the new password and logs out every session', async () => {
    const user = await createUser(testApp);
    const { refreshToken } = await loginWeb(testApp, user);

    await forgot(user.email).expect(201);
    await reset(user.email, lastCode(testApp, user.email)).expect(201);

    await testApp
      .http()
      .post('/api/auth/refresh')
      .send({ client: AuthClient.WEB, refreshToken })
      .expect(401);
    await login(testApp, AuthClient.WEB, user).expect(401);
    await login(testApp, AuthClient.WEB, {
      email: user.email,
      password: NEW_PASSWORD,
    }).expect(201);
  });

  it('answers an unknown email the same way without mailing', async () => {
    const known = await createUser(testApp);
    const email = 'nobody@example.com';

    const unknown = await forgot(email).expect(201);
    const found = await forgot(known.email).expect(201);

    expect(unknown.body).toEqual(found.body);
    expect(mailsTo(testApp, email)).toHaveLength(0);
  });

  it('accepts a code only once', async () => {
    const user = await createUser(testApp);
    await forgot(user.email).expect(201);
    const code = lastCode(testApp, user.email);

    await reset(user.email, code).expect(201);
    const reused = await reset(user.email, code).expect(400);

    expect(reused.body.code).toBe(UserErrorEnum.INVALID_CODE);
  });

  it('rejects an expired code', async () => {
    const user = await createUser(testApp);
    await forgot(user.email).expect(201);
    await testApp.dataSource
      .getRepository(EmailCode)
      .update({ userId: user.id }, { expiresAt: new Date(Date.now() - 1000) });

    await reset(user.email, lastCode(testApp, user.email)).expect(400);
  });

  it('lets an unverified Google-only account set a password', async () => {
    const user = await createUser(testApp, { emailVerified: false });
    await testApp.dataSource
      .getRepository(User)
      .update(user.id, { password: null, provider: Provider.GOOGLE });

    await forgot(user.email).expect(201);
    await reset(user.email, lastCode(testApp, user.email)).expect(201);

    await login(testApp, AuthClient.WEB, {
      email: user.email,
      password: NEW_PASSWORD,
    }).expect(201);
  });
});
