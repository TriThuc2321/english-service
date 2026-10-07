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

Global guard chain, applied in `app.module.ts` via `APP_GUARD` in this order: `ThrottlerGuard` → `JwtAuthGuard` → `PermissionGuard`.

- **`JwtAuthGuard`** (`modules/auth/guards/jwt.guard.ts`): passport `jwt` strategy (Bearer header, `JWT_SECRET`); bypassed only by `@Public()`.
- **`PermissionGuard`** (`modules/auth/guards/permission.guard.ts`): reads `@CheckPermissions(...)` metadata and checks it against a CASL `AppAbility` built from the JWT's embedded `permissions` array (`CaslAbilityFactory.createForUser`). **Default-deny**: if a handler has neither `@Public()` nor `@CheckPermissions()`, `canActivate` returns `false` — every new endpoint must be explicitly annotated with one or the other, or it is unreachable.
- Permissions are `(PermissionAction, PermissionSubject)` pairs (see `types/auth.type.ts`) baked into the JWT payload at token-issue time (`AuthService.toTokenPayload`), sourced from the user's `role.permissions` — they are not re-queried from the DB per-request, so a role/permission change only takes effect on the next refresh/login (access tokens default to 5m).
- `@CheckPermissions()` called with **no arguments** still requires the decorator to be present (it sets metadata to `[]`), and `[].every(...)` is vacuously true — this is how routes like `GET /auth/profile` and `POST /auth/logout` are made "authenticated but unrestricted" without being `@Public()`.
- Login (`auth.service.ts`) always runs `bcrypt.compare` against a precomputed `DUMMY_PASSWORD_HASH` when no user/password is found, to keep timing constant and avoid user enumeration — preserve this pattern in any similar auth flow.

#### Refresh tokens

- Access token is returned in the JSON body (`access_token`); the refresh token is **only** ever set as an `httpOnly` cookie (`refresh_token`, helpers in `modules/auth/auth.cookie.ts`) scoped to path `/api/auth`, `sameSite: 'none'`, `secure` only in production. `cookie-parser` is registered in `main.ts` and CORS uses `credentials: true` — clients must send requests with credentials.
- Refresh JWTs are signed with a separate `JWT_SECRET_REFRESH` and carry `{ sub, jti }`. Each issued token is persisted in `refresh_tokens` (`refresh-token.entity.ts`) keyed by `jti` with a sha256 `tokenHash`, `expiresAt`, `revokedAt`.
- `POST /auth/refresh` **rotates**: it atomically revokes the presented token (single `UPDATE ... WHERE revokedAt IS NULL`) and issues a new pair. If the signature is valid but no live row matched (already rotated/revoked), it is treated as replay-after-theft and **all** sessions for that user are revoked. Any failure clears the cookie.
- `POST /auth/logout` revokes the current cookie's token, or every token for the user when `allDevices: true`.
- Expired rows are deleted opportunistically on each issue (fire-and-forget) — there is no scheduler.
- `/auth/login` and `/auth/refresh` have a tighter `@Throttle` (10/min) than the global throttler.

### Conventions

- Import ordering/grouping is enforced by oxfmt (`sortImports` in `.oxfmtrc.json`): type imports, then external, then internal types, internal values, then relative imports (parent/sibling/index) — run `pnpm format` rather than hand-ordering imports.
- DTOs use `class-validator`/`class-transformer`; the global `ValidationPipe` in `main.ts` has `transform: true`.
- API is served under the `/api` prefix (`app.setGlobalPrefix('api')`); Swagger docs are at `/docs` (`SWAGGER_PATH`), which gets a relaxed CSP via a second `helmet()` instance scoped to that path in `main.ts`.
- HTTPS is optional locally: set `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH` (see `certs/`) or the server falls back to HTTP.
- Do not add redundant comments — no comments that restate what the code already says (e.g. `// get user by id` above `getUserById`). Only comment non-obvious WHY (a workaround, a hidden constraint, a subtle invariant).
