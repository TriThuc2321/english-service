# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install              # install deps (pnpm workspace)
docker compose up -d      # local Postgres 16 (user/pass `postgres`, db `myenglish`, port 5432)
pnpm start:dev            # dev server with watch
pnpm build                # nest build
pnpm typecheck            # tsc --noEmit
pnpm lint                 # oxlint src/ test/
pnpm lint:fix             # oxlint --fix
pnpm format               # oxfmt . (writes)
pnpm format:check         # oxfmt --check .

pnpm test                 # vitest run (unit, *.spec.ts)
pnpm test:watch           # vitest watch mode
pnpm test:cov             # vitest run --coverage
pnpm test:e2e             # vitest run --config ./vitest.config.e2e.ts (*.e2e-spec.ts)

# run a single test file
pnpm vitest run path/to/file.spec.ts
# run a single test by name
pnpm vitest run -t "test name"
```

Pre-commit runs `lint-staged` (oxfmt + oxlint --fix on staged files) then `tsc --noEmit` via husky. Commit messages are enforced by commitlint (`@commitlint/config-conventional`) — use conventional commit format (`feat:`, `fix:`, etc).

CI (`.github/workflows/ci.yml`, on PRs/pushes to `dev`/`main`) runs `format:check` → `lint` → `typecheck` → `build`. It does **not** run tests, and there are currently no spec files in the repo. PRs to `dev`/`main` also get an automated Claude code review (`claude-code-review.yml`).

Lint/format are handled by **oxlint** and **oxfmt**, not ESLint/Prettier — there are no `.eslintrc`/`.prettierrc` files, config lives in `.oxlintrc.json` / `.oxfmtrc.json`.

Copy `.env.example` to `.env`; required vars are validated at boot (see below). There are no TypeORM migrations — the schema comes from `DATABASE_SYNC=true` (`synchronize`), so entity changes are applied directly to the DB on start.

## Architecture

NestJS (v12) API using ESM (`"type": "module"`, `nodenext` module resolution — all relative imports use explicit `.js` extensions even in `.ts` source). PostgreSQL via TypeORM.

### Module layout

- `src/configs/` — one file per config namespace, each registered via `@nestjs/config`'s `registerAs` (database, jwt, google oauth, cors, swagger, https/common). `env.validation.ts` defines required env vars with `class-validator` and is wired into `ConfigModule.forRoot({ validate })` in `app.module.ts` — required env vars fail fast at boot (`JWT_SECRET`/`JWT_SECRET_REFRESH` must be ≥32 chars).
- `src/entities/` — TypeORM entities, loaded via glob path in `database.config.ts` (`entities/*.entity.{js,ts}`), not per-module registration. Every entity composes `AuditMetadata` (`createdAt/createdById/updatedAt/updatedById`) via `@Column(() => AuditMetadata)`. Soft-delete is via a `status` enum (`Status.DELETED`), not TypeORM's `@DeleteDateColumn` — unique indexes are conditioned on `status != 'DELETED'` (see `user.entity.ts`, `role.entity.ts`, `permission.entity.ts`).
- `src/modules/` — one directory per feature module (`auth`, `users`), each with its own `controller`/`service`/`module`, plus nested `dto/`, `guards/`, `decorators/`, `strategies/` as needed.
- `src/shared/casl/` — CASL-based ability factory shared across modules (not scoped to `auth`).
- `src/types/` — shared enums/interfaces (`PermissionAction`, `PermissionSubject`, token payloads, `Status`).

### Auth & permissions (read before touching any endpoint)

Sequence diagrams for the backoffice (`bo`) and student BFF (`web`) flows live in `docs/auth-flow.md` — keep them in sync when changing auth.

Global guard chain, applied in `app.module.ts` via `APP_GUARD` in this order: `ThrottlerGuard` → `JwtAuthGuard` → `PermissionGuard`.

- **`JwtAuthGuard`** (`modules/auth/guards/jwt.guard.ts`): passport `jwt` strategy (Bearer header, `JWT_SECRET`); bypassed only by `@Public()`.
- **`PermissionGuard`** (`modules/auth/guards/permission.guard.ts`): reads `@CheckPermissions(...)` metadata and checks it against a CASL `AppAbility` built from the JWT's embedded `permissions` array (`CaslAbilityFactory.createForUser`). **Default-deny**: if a handler has neither `@Public()` nor `@CheckPermissions()`, `canActivate` returns `false` — every new endpoint must be explicitly annotated with one or the other, or it is unreachable.
- Permissions are `(PermissionAction, PermissionSubject)` pairs (see `types/auth.type.ts`) baked into the JWT payload at token-issue time (`AuthService.toTokenPayload`), sourced from the user's `role.permissions` — they are not re-queried from the DB per-request, so a role/permission change only takes effect on the next refresh/login (access tokens default to 5m).
- `@CheckPermissions()` called with **no arguments** still requires the decorator to be present (it sets metadata to `[]`), and `[].every(...)` is vacuously true — this is how routes like `GET /auth/profile` are made "authenticated but unrestricted" without being `@Public()`.
- Login (`auth.service.ts`) always runs `bcrypt.compare` against a precomputed `DUMMY_PASSWORD_HASH` when no user/password is found, to keep timing constant and avoid user enumeration — preserve this pattern in any similar auth flow.

#### Refresh tokens

- Two clients (`AuthClient`): `bo` (backoffice SPA) and `web` (student Next.js BFF). Every auth request carries `client`.
  - `bo`: access token in the JSON body (kept in memory by the SPA, sent as Bearer); refresh token **only** as an `httpOnly` cookie `refresh_token_bo` (helpers in `modules/auth/auth.cookie.ts`), path `/api/auth`, `sameSite: 'lax'`, `secure` — works because api/backoffice/student share the registrable domain. CORS uses `credentials: true`.
  - `web` (`isServerClient`): both tokens in the JSON body; the BFF stores them in its own cookies and sends the refresh token back in the body. Google login redirects with a 60s single-use `code` (a short-lived refresh token) that the BFF exchanges via `/auth/refresh`.
- Access tokens embed `client`. `@Clients(AuthClient.BO)` (class-level on CMS controllers) makes `PermissionGuard` reject tokens issued to other clients — add it to any new CMS controller.
- Google OAuth `state` is `client.nonce[.clientNonce]` (`modules/auth/oauth-state.ts`); `nonce` is bound to the `oauth_state` cookie and checked in the callback. `clientNonce` (optional `?nonce=` on `/auth/google`) is echoed back as `state` on the `web` redirect so the BFF can bind the `code` to its own cookie.
- Refresh JWTs are signed with a separate `JWT_SECRET_REFRESH` and carry `{ sub, sid, jti, client }`. Each login creates **one** row in `auth_sessions` (`auth-session.entity.ts`) keyed by `sid`, holding the `currentJti` + sha256 `tokenHash` of the only valid refresh token, `previousJti`/`rotatedAt`, `expiresAt` (sliding) and `revokedAt`. The table grows with sessions, not with refreshes — the BO refreshes on every page load since its access token lives in memory.
- `POST /auth/refresh` **rotates in place**: a single `UPDATE ... WHERE id = sid AND currentJti = jti AND tokenHash AND revokedAt IS NULL AND expiresAt > now` swaps in the new `jti`/hash and slides `expiresAt`. If nothing matched but the session is alive: `jti == previousJti` within 30s → `REFRESH_TOKEN_ROTATED` (concurrent refresh, not punished); any other superseded token → replay-after-theft, **all** sessions for that user are revoked. Any failure clears the cookie.
- `POST /auth/logout` is `@Public()` and identified by the refresh token (cookie for `bo`, body for `web`), so it works after the access token expired; it revokes that session (`sid`), or every session for the user when `allDevices: true`. Invalid tokens are a no-op.
- Expired sessions, and sessions revoked more than a day ago, are deleted opportunistically on each login (fire-and-forget) — there is no scheduler.
- `/auth/login`, `/auth/refresh` and `/auth/logout` have a tighter `@Throttle` (10/min) than the global throttler (300/min). The student BFF calls the API from one server, so set `TRUST_PROXY` to cover it (and any LB) — the throttler then keys on the forwarded client IP.

### Conventions

- Import ordering/grouping is enforced by oxfmt (`sortImports` in `.oxfmtrc.json`): type imports, then external, then internal types, internal values, then relative imports (parent/sibling/index) — run `pnpm format` rather than hand-ordering imports.
- DTOs use `class-validator`/`class-transformer`; the global `ValidationPipe` in `main.ts` has `transform: true`.
- API is served under the `/api` prefix (`app.setGlobalPrefix('api')`); Swagger docs are at `/docs` (`SWAGGER_PATH`), which gets a relaxed CSP via a second `helmet()` instance scoped to that path in `main.ts`.
- HTTPS is optional locally: set `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH` (see `certs/`) or the server falls back to HTTP.
- Do not add redundant comments — no comments that restate what the code already says (e.g. `// get user by id` above `getUserById`). Only comment non-obvious WHY (a workaround, a hidden constraint, a subtle invariant).
