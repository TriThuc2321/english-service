# Deployment

All three apps (API, BO, student web) run on Vercel. There are two environments, each with its own API and Postgres:

| Env  | Branch | API domain         | DB                      |
| ---- | ------ | ------------------ | ----------------------- |
| dev  | `dev`  | `api-dev.<domain>` | Dedicated dev Postgres  |
| prod | `main` | `api.<domain>`     | Dedicated prod Postgres |

Code flow: `feat/*` → PR into `dev` (deploys dev) → PR `dev` → `main` (deploys prod). CI (`ci.yml`) runs on both branches.

## To do

- [x] TypeORM migrations, drop `synchronize` (see _Migrations_ in `CLAUDE.md`)
- [ ] Create the `dev` branch from `main` and enable branch protection on `dev` and `main` (CI must pass)
- [ ] Disable or protect Swagger `/docs` in prod
- [ ] Script to create the first SUPER_ADMIN (there is no seed yet, see below)
- [ ] Back up the prod Postgres

## Vercel

**API** (`english-service`): the project uses the **NestJS** framework preset, install `pnpm install`, build `pnpm build`, Node `24.x`. Attach branch `main` to `api.<domain>` and branch `dev` to `api-dev.<domain>`; set environment variables separately for Production (prod) and for the Preview of branch `dev`.

- Don't add any CommonJS dependency that `require()`s a Nest package: Vercel's function loader can't `require()` `@nestjs/common` (ESM-only). That is why the throttler is the in-house one in `shared/throttle/`.
- **Vercel doesn't run migrations.** Before merging into `dev`/`main`, run `pnpm build && pnpm migration:run` with that env's `DATABASE_*` (migrations are additive, so running them before the new code ships is safe).

**BO** (`english-backoffice`) and **student web** (`english-student`): each project attaches branch `main` to the prod domain and branch `dev` to the dev domain (`bo-dev.<domain>`, `dev.<domain>`), with per-branch environment variables pointing at the matching API (`VITE_API_URL`, `NEXT_PUBLIC_API_URL`).

## Environment variables per env

Every secret differs between dev and prod.

| Variable                                                      | dev                                                    | prod                                            |
| ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `DATABASE_*`                                                  | dev Postgres (`DATABASE_SSL=true` for a managed DB)    | prod Postgres                                   |
| `JWT_SECRET`, `JWT_SECRET_REFRESH`                            | `openssl rand -base64 48`                              | different values from dev                       |
| `GOOGLE_CLIENT_ID/SECRET`                                     | same OAuth client or a separate one                    | prod OAuth client                               |
| `GOOGLE_CALLBACK_URL`                                         | `https://api-dev.<domain>/api/auth/google/callback`    | `https://api.<domain>/api/auth/google/callback` |
| `GOOGLE_LOGIN_REDIRECT_URL_WEB` / `_BO`                       | dev frontend callback URLs                             | prod frontend callback URLs                     |
| `CORS_ORIGINS`                                                | `https://bo-dev.<domain>,https://dev.<domain>`         | `https://bo.<domain>,https://<domain>`          |
| `TRUST_PROXY`                                                 | covers Vercel's proxy + the dev student web BFF server | same for prod                                   |
| `STORAGE_BUCKET`                                              | `myenglish-dev`                                        | `myenglish`                                     |
| `STORAGE_PUBLIC_URL`                                          | `https://media-dev.<domain>`                           | `https://media.<domain>`                        |
| `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID/SECRET_ACCESS_KEY` | R2 API token scoped to the dev bucket only             | token scoped to the prod bucket only            |
| `STORAGE_DOWNLOAD_URL_TTL` (optional)                         | lifetime of presigned URLs in seconds, default `3600`  | same as dev                                     |
| `HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`                           | leave empty (Vercel terminates TLS)                    | leave empty                                     |

## Easy-to-miss constraints

- **HTTPS is required**: the BO refresh cookie is `secure`, so over HTTP the BO can't refresh.
- **Same registrable domain**: the `sameSite: 'lax'` cookie needs the API, BO and web on the same parent domain (`api-dev.x.com` + `bo-dev.x.com`). Don't use the default `*.vercel.app` domains for the login flow.
- **Google Cloud Console**: add both callback URLs to _Authorized redirect URIs_.
- **R2**: each bucket needs a CORS rule allowing `PUT` from that env's BO origin **and student web origin** (students upload Speaking recordings straight to R2), plus a public custom domain (`media-dev.` / `media.`).
- **Block `/attempts/*` on the public domain**: student recordings live under the `attempts/` prefix in the same bucket and must only be read through presigned URLs (expiring after `STORAGE_DOWNLOAD_URL_TTL`). Add a Cloudflare rule (WAF custom rule) blocking every request to `media(-dev).<domain>` whose path starts with `/attempts/`; otherwise anyone who knows a key can listen to it.
- **Grading permissions**: the teacher role needs `READ` and `CREATE` on the `assessment` subject (queue + Writing/Speaking grading at `/grading`). Grant them in the CMS before launching the feature; permissions live in the JWT, so they apply from the next refresh/login.
- **The throttler** keeps its state in each function instance's memory, so on Vercel limits are counted per instance; move its storage to Redis if exact limits matter.
- Changing `STORAGE_PUBLIC_URL` once there is data requires an `UPDATE users SET avatar = ...` (avatars store the full URL).

## First deploy of each env

1. Run `pnpm build && pnpm migration:run` with that env's `DATABASE_*` to create the schema on the empty DB.
2. On boot, the app upserts the system roles (`SUPER_ADMIN`, `ADMIN`, `USER`) and the score scales.
3. Create the first admin: sign in with Google once using your account (this creates a `USER`-role user), then run on that env's DB:

   ```sql
   UPDATE users
   SET role_id = (SELECT role_id FROM roles WHERE code = 'SUPER_ADMIN')
   WHERE email = '<your email>';
   ```

   Sign in again so the token carries the new permissions.

## Migrations during development

For every entity change:

1. Edit the entity.
2. `pnpm migration:generate src/migrations/<Name>` (diffs against the DB in `.env`, which must already be migrated to the latest).
3. Review the generated SQL (a column rename → rewrite as `RENAME COLUMN`; shared enums → drop the repeated `CREATE/DROP TYPE`).
4. `pnpm migration:run` on the local DB, then run `pnpm test:e2e` (`migrations.e2e-spec.ts` catches a missing migration).
5. Commit the migration in the same PR as the entity change.

**An existing local DB** created with `synchronize` will make `Init` fail with "table already exists". Pick one:

- Keep the data: the local schema already matches the entities, so mark `Init` as run without executing it: `pnpm build && node --env-file=.env node_modules/typeorm/cli.js -d dist/data-source.js migration:run --fake`.
- Start over: `docker compose down -v && docker compose up -d && pnpm build && pnpm migration:run` (loses local data).

Remove `DATABASE_SYNC` from your local `.env`; it is no longer read.
