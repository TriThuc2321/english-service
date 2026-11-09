# Auth: register, email verification, forgot/reset password

## Context
`POST /auth/login` (email + password) already exists but students can't create accounts: users come only from BO admin creation or Google sign-in. Login rejects `emailVerified = false` with `403 EMAIL_NOT_VERIFIED`, and the repo has no way to send email. Goal: students self-register on `web`, verify their email with a 6-digit code, and anyone with a LOCAL/Google account can reset a forgotten password by code. Decisions (agreed in brainstorming): Resend for mail, 6-digit OTP, `email_codes` table, no email enumeration, verify-email auto-signs-in, reset revokes all sessions without auto-login, register is web-only, reset works for any client.

## Step 0 — workflow
- Branch off `main`: `feat/auth-register-reset`.
- Save this design as `docs/superpowers/specs/2026-11-09-auth-register-reset-design.md` and commit (`docs: ...`).
- TDD: write each spec/e2e test before its implementation.

## API (all `@Public()`, `@Throttle(AUTH_THROTTLE)`, on `AuthController`)
| Route | Body | Response |
|---|---|---|
| `POST /auth/register` | `client` (`@IsIn([AuthClient.WEB])`), `email`, `password` (`@Length(8, 72)`), `firstName`, `lastName?` | `201 MessageResponseDto` (always same) |
| `POST /auth/verify-email` | `client`, `email`, `code` (`@Matches(/^\d{6}$/)`) | `201 TokenResponseDto` via existing `respondWithTokens` |
| `POST /auth/verify-email/resend` | `email` | `201 MessageResponseDto` |
| `POST /auth/forgot-password` | `email` | `201 MessageResponseDto` |
| `POST /auth/reset-password` | `email`, `code`, `newPassword` (`@Length(8, 72)`) | `201` no body |

Behaviour:
- **register**: no user → create LOCAL, `USER` role, `emailVerified=false`, issue VERIFY_EMAIL code, mail it. Existing ACTIVE unverified LOCAL user → overwrite firstName/lastName/password, issue + mail code. Existing verified or GOOGLE user → mail "already registered" notice (respect cooldown via a code issue? no — just send; throttle covers abuse). Identical response every time.
- **verify-email**: consume VERIFY_EMAIL code → set `emailVerified=true` → `assertClientAccess` → `issueTokens`. Failure → `400 { code: INVALID_CODE }`.
- **resend**: only for ACTIVE unverified users; otherwise no-op. Generic 201.
- **forgot-password**: any ACTIVE user (any provider) → issue + mail RESET_PASSWORD code. Unknown → no-op. Generic 201.
- **reset-password**: consume RESET_PASSWORD code → bcrypt hash new password, `emailVerified=true` → `revokeAllForUser`. Failure → `400 INVALID_CODE`.
- Login unchanged.

## Data
- `src/entities/email-code.entity.ts` → table `email_codes`: `id` serial, `userId` uuid FK users (`onDelete: CASCADE`), `purpose` enum (`enumName: 'email_code_purpose_enum'`, values in `src/types/auth.type.ts` as `EmailCodePurpose { VERIFY_EMAIL, RESET_PASSWORD }`), `codeHash` char(64), `expiresAt` timestamptz, `attempts` int default 0, `consumedAt` timestamptz nullable, `@Column(() => AuditMetadata, { prefix: false })`. Unique index `uq_email_codes_user_purpose` on `(userId, purpose)`.
- Migration: `pnpm migration:generate src/migrations/AddEmailCodes` against a DB migrated to `main`; review SQL.

## Components
- `src/modules/auth/email-code.service.ts` (`EmailCodeService`, constants `CODE_TTL_MS = 10 min`, `MAX_ATTEMPTS = 5`, `RESEND_COOLDOWN_MS = 60 s`):
  - `issue(userId, purpose): Promise<string | null>` — `null` if a row exists with `updatedAt` within cooldown and not consumed; else upsert (`orUpdate` on the unique index) with new `sha256` hash, `attempts=0`, `consumedAt=null`, new `expiresAt`. Code from `crypto.randomInt(0, 1_000_000)` zero-padded.
  - `consume(userId | undefined, purpose, code): Promise<boolean>` — transaction, `SELECT ... FOR UPDATE`; reject if missing/consumed/expired/`attempts >= MAX_ATTEMPTS`; compare with `timingSafeEqual`; miss → `attempts + 1`; hit → `consumedAt = now`. Unknown user still hashes + compares against a dummy so timing is uniform.
- `src/shared/mail/`: `mail.module.ts` (global-ish, exported), `mail.service.ts` (`MailService.send({ to, subject, html, text })` using `resend` SDK; logs and swallows errors so callers stay generic), `mail.templates.ts` (`verifyEmailTemplate(code)`, `resetPasswordTemplate(code)`, `alreadyRegisteredTemplate()`). `src/configs/mail.config.ts` `registerAs('mail')` reading `RESEND_API_KEY`, `MAIL_FROM`.
- `env.validation.ts`: add required `RESEND_API_KEY` (`@IsString @IsNotEmpty`), `MAIL_FROM` (`@IsString @IsNotEmpty`). Add to `.env.example`, `test/setup-env.ts`, and the placeholder env in `src/openapi.ts`.
- `pnpm add resend` (pin exact current version; verify it's ESM and has no Nest `require()`).
- `AuthService` (`src/modules/auth/auth.service.ts`): add `register`, `verifyEmail`, `resendVerification`, `forgotPassword`, `resetPassword`. Extract `getDefaultRoleId()` from `thirdPartyLogin` and reuse. Reuse `revokeAllForUser`, `issueTokens`, `assertClientAccess`, `USER_TOKEN_SELECT`. Hash with bcrypt using the same rounds as `UsersService` (export `BCRYPT_ROUNDS` if not already exported). Lowercase/trim email consistently with how login looks it up (check `LoginDto`/`UsersService` — keep same behaviour).
- `AuthModule`: register `EmailCodeService`, `TypeOrmModule.forFeature([..., EmailCode])`, import `MailModule`.
- `UserErrorEnum.INVALID_CODE` in `src/types/auth.type.ts`.
- DTOs in `src/modules/auth/dto/auth.dto.ts`; `MessageResponseDto` in `dto/auth-response.dto.ts` (or reuse a shared one if `shared/dto` has it). Swagger: `@ApiCreatedResponse`, `@ApiBadRequestResponse({ type: ErrorResponseDto })` on verify/reset.
- Docs: add register/verify/reset sequences to `docs/auth-flow.md`; short CLAUDE.md note under "Auth & permissions" (email_codes, MailService, codes hashed/one-per-purpose/5 attempts/60 s cooldown, no enumeration). `pnpm openapi:generate` and commit `openapi.json`.
- No redundant comments (user preference).

## Tests
- Unit `src/modules/auth/email-code.service.spec.ts` (mock repository/data source): issue returns 6 digits; cooldown returns null; consume success once then false; wrong code increments; 6th attempt fails even with right code; expired fails.
- `test/utils/app.ts`: override `MailService` with `{ send: vi.fn() }` like `StorageService`; expose a helper to read the last code sent to an address.
- `test/auth-register.e2e-spec.ts`: register → login 403 `EMAIL_NOT_VERIFIED` → verify → tokens → login OK; register with existing verified email → 201 + "already registered" mail, password unchanged; re-register unverified overwrites password; bo client rejected 400; 5 wrong codes then right code → 400.
- `test/auth-reset-password.e2e-spec.ts`: forgot → reset → old refresh token 401 → login with new password; unknown email → 201, no mail; reused code → 400.
- Keep each file < 10 calls per throttled route.

## Verification
- `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e && pnpm build`
- `pnpm openapi:generate` → no further diff after commit.
- Manual: `docker compose up -d`, `pnpm migration:run`, `pnpm start:dev` with a real `RESEND_API_KEY`, register via `/docs`, receive code, verify, reset.
- Remind user: run `pnpm migration:run` against dev/main DB before merging; set `RESEND_API_KEY`/`MAIL_FROM` in Vercel envs (verified sender domain in Resend).
