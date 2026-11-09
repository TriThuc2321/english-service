import { randomUUID } from 'node:crypto';

import { User } from '../src/entities/user.entity.js';
import { AuthService } from '../src/modules/auth/auth.service.js';
import { MAX_ATTEMPTS } from '../src/modules/auth/email-code.service.js';
import { AuthClient, UserErrorEnum } from '../src/types/auth.type.js';
import { Provider } from '../src/types/user.type.js';
import { createTestApp, type TestApp } from './utils/app.js';
import { createUser, lastCode, login, mailsTo } from './utils/fixtures.js';

const PASSWORD = 'n3w-Passw0rd';

const wrongCode = (code: string) =>
  ((Number(code) + 1) % 1_000_000).toString().padStart(6, '0');

describe('POST /api/auth/register', () => {
  let testApp: TestApp;

  const register = (email: string, password = PASSWORD) =>
    testApp
      .http()
      .post('/api/auth/register')
      .send({ client: AuthClient.WEB, email, password, firstName: 'Ann' });

  const verify = (email: string, code: string) =>
    testApp
      .http()
      .post('/api/auth/verify-email')
      .send({ client: AuthClient.WEB, email, code });

  const newEmail = () => `student-${randomUUID()}@example.com`;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp?.app.close();
  });

  it('creates an unverified student who can log in once the code is verified', async () => {
    const email = newEmail();

    const res = await register(email).expect(201);

    expect(res.body).toEqual({ message: expect.any(String) });
    const user = await testApp.dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email }, relations: { role: true } });
    expect(user).toMatchObject({
      emailVerified: false,
      provider: Provider.LOCAL,
      firstName: 'Ann',
    });
    expect(user.role.code).toBe('USER');

    const blocked = await login(testApp, AuthClient.WEB, {
      email,
      password: PASSWORD,
    }).expect(403);
    expect(blocked.body.code).toBe(UserErrorEnum.EMAIL_NOT_VERIFIED);

    const verified = await verify(email, lastCode(testApp, email)).expect(201);
    expect(verified.body).toEqual({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      refresh_token_expires_at: expect.any(String),
    });

    await login(testApp, AuthClient.WEB, { email, password: PASSWORD }).expect(
      201,
    );
  });

  it('answers the same for a verified email, mails a notice and keeps the password', async () => {
    const existing = await createUser(testApp);
    const fresh = newEmail();

    const taken = await register(existing.email, 'other-password').expect(201);
    const free = await register(fresh).expect(201);

    expect(taken.body).toEqual(free.body);
    expect(mailsTo(testApp, existing.email)).toEqual([
      expect.objectContaining({ subject: 'You already have an account' }),
    ]);
    await login(testApp, AuthClient.WEB, existing).expect(201);
  });

  it('lets a repeated sign-up of an unverified email replace its password', async () => {
    const email = newEmail();
    await register(email, 'first-password').expect(201);
    await register(email, PASSWORD).expect(201);

    expect(mailsTo(testApp, email)).toHaveLength(1);
    await verify(email, lastCode(testApp, email)).expect(201);
    await login(testApp, AuthClient.WEB, { email, password: PASSWORD }).expect(
      201,
    );
  });

  it('refuses the bo client', async () => {
    await testApp
      .http()
      .post('/api/auth/register')
      .send({
        client: AuthClient.BO,
        email: newEmail(),
        password: PASSWORD,
        firstName: 'Ann',
      })
      .expect(400);
  });

  it(`burns the code after ${MAX_ATTEMPTS} wrong guesses`, async () => {
    const email = newEmail();
    await register(email).expect(201);
    const code = lastCode(testApp, email);

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      const res = await verify(email, wrongCode(code)).expect(400);
      expect(res.body.code).toBe(UserErrorEnum.INVALID_CODE);
    }

    await verify(email, code).expect(400);
  });

  it('drops a squatted password when Google verifies the email', async () => {
    const email = newEmail();
    await register(email, 'attacker-password').expect(201);

    await testApp.app.get(AuthService).thirdPartyLogin(
      {
        email,
        emailVerified: true,
        firstName: 'Victim',
        accessToken: '',
        refreshToken: '',
      },
      AuthClient.WEB,
    );

    await login(testApp, AuthClient.WEB, {
      email,
      password: 'attacker-password',
    }).expect(401);
    const user = await testApp.dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email } });
    expect(user.emailVerified).toBe(true);
  });

  it('does not resend a code during the cooldown', async () => {
    const email = newEmail();
    await register(email).expect(201);

    await testApp
      .http()
      .post('/api/auth/verify-email/resend')
      .send({ email })
      .expect(201);

    expect(mailsTo(testApp, email)).toHaveLength(1);
  });
});
