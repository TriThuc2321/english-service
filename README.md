# english-service

The MyEnglish API is a NestJS backend for an IELTS and TOEIC practice platform. It holds the test catalogue, runs timed student attempts, scores them, and gives teachers a workflow to grade IELTS Writing and Speaking.

## The MyEnglish system

| Repo                                                  | Role                                                                     | Stack                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------ |
| **english-service** (this repo)                       | REST API, database, scoring, file storage                                | NestJS 12, TypeORM, PostgreSQL |
| [english-backoffice](../english-backoffice/README.md) | Staff CMS: content, users and roles, grading, student results            | React Router 7 SPA, Vite       |
| [english-student](../english-student/README.md)       | Student app: test library, exams, results. Also acts as the BFF for auth | Next.js 16                     |

## Features

- **Auth**: Google OAuth and password login for two clients. The backoffice (`bo`) keeps its refresh token in an `httpOnly` cookie. The student BFF (`web`) receives both tokens in the response body. Refresh tokens rotate in place, and replaying a stale one revokes every session for that user. See [docs/auth-flow.md](docs/auth-flow.md).
- **Permissions**: CASL `(action, subject)` pairs are embedded in the JWT. Access is denied by default: every endpoint must declare `@Public()` or `@CheckPermissions()`.
- **Test catalogue**: tests → sections → parts → passages → question groups → questions, covering IELTS (Academic/General) and TOEIC formats. See [docs/question-formats.md](docs/question-formats.md).
- **Test import**: `POST /tests/import` creates a complete draft test from a single JSON document. It reports every validation issue in one pass.
- **Media**: files are stored in Cloudflare R2 through the S3 API. Uploads use presigned PUTs, and public reads go through a CDN domain. Student Speaking recordings are private and are only served through presigned GET URLs.
- **Student attempts**: start, autosave, submit, history and results, with lazy expiry (no scheduler). IELTS band and TOEIC scaled scoring are included.
- **Teacher grading**: an append-only assessment history for IELTS Writing (TA/TR, CC, LR, GRA) and Speaking (FC, LR, GRA, P), with optimistic revision checks.
- **OpenAPI**: the committed `openapi.json` is the contract the frontends build against.

## Prerequisites

- Node.js 24 and pnpm
- Docker (for local Postgres and the e2e tests)
- Optional: [mkcert](https://github.com/FiloSottile/mkcert) for local HTTPS (`certs/`)

## Getting started

```bash
pnpm install
cp .env.example .env          # fill in the values, see below
docker compose up -d          # Postgres 16 on :5432 (postgres/postgres, db myenglish)
pnpm build && pnpm migration:run
pnpm start:dev
```

The API is served under `/api`, and Swagger UI is at `/docs`. If `HTTPS_KEY_PATH`/`HTTPS_CERT_PATH` are set, the server runs over HTTPS; otherwise it falls back to HTTP.

> The backoffice refresh cookie is `secure` and `sameSite: 'lax'`. For backoffice login to work locally, run the API and the frontends over HTTPS on a shared domain (for example `api.myenglish.com`, `backoffice.myenglish.com` and `student.myenglish.com` mapped to `127.0.0.1` in `/etc/hosts`).

## Environment variables

Required variables are validated at boot (`src/configs/env.validation.ts`), so a missing value stops the app at startup.

| Variable                                                                 | Purpose                                                                        |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `APP_PORT`                                                               | HTTP port                                                                      |
| `DATABASE_HOST` / `_PORT` / `_USERNAME` / `_PASSWORD` / `_NAME` / `_SSL` | PostgreSQL connection                                                          |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `GOOGLE_CALLBACK_URL`                   | Google OAuth                                                                   |
| `GOOGLE_LOGIN_REDIRECT_URL_WEB` / `_BO`                                  | Where each frontend receives the user after Google login                       |
| `JWT_SECRET` / `JWT_SECRET_REFRESH`                                      | Access and refresh signing keys (at least 32 characters each)                  |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`                              | Token lifetimes                                                                |
| `CORS_ORIGINS`                                                           | Comma-separated allowed origins                                                |
| `TRUST_PROXY`                                                            | Express `trust proxy`. Must cover the student BFF server and any load balancer |
| `STORAGE_ENDPOINT` / `_BUCKET` / `_ACCESS_KEY_ID` / `_SECRET_ACCESS_KEY` | Cloudflare R2 (S3-compatible)                                                  |
| `STORAGE_PUBLIC_URL`                                                     | Public CDN domain attached to the bucket                                       |
| `STORAGE_UPLOAD_URL_TTL` / `STORAGE_DOWNLOAD_URL_TTL`                    | Lifetimes of presigned URLs, in seconds                                        |
| `HTTPS_KEY_PATH` / `HTTPS_CERT_PATH` / `HTTPS_LOCAL_DOMAIN`              | Optional local HTTPS                                                           |

## Scripts

| Command                                           | Description                                                   |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `pnpm start:dev`                                  | Dev server in watch mode                                      |
| `pnpm build` / `pnpm start:prod`                  | Compile to `dist/` / run the compiled app                     |
| `pnpm typecheck`                                  | `tsc --noEmit`                                                |
| `pnpm lint` / `pnpm lint:fix`                     | oxlint                                                        |
| `pnpm format` / `pnpm format:check`               | oxfmt                                                         |
| `pnpm test` / `pnpm test:watch` / `pnpm test:cov` | Unit tests (Vitest)                                           |
| `pnpm test:e2e`                                   | E2E tests against a Postgres Testcontainer (needs Docker)     |
| `pnpm migration:generate src/migrations/Name`     | Build, then diff entities against the DB into a new migration |
| `pnpm migration:create src/migrations/Name`       | Empty migration for hand-written SQL                          |
| `pnpm migration:run` / `:revert` / `:show`        | Apply, undo or list migrations (run `pnpm build` first)       |
| `pnpm openapi:generate`                           | Regenerate `openapi.json`                                     |

## Project structure

```
src/
  configs/      config namespaces (database, jwt, google, cors, swagger, https) + env validation
  entities/     TypeORM entities (soft delete via a `status` enum)
  migrations/   schema migrations (synchronize is never enabled)
  modules/
    auth, users, roles, permissions
    tests, test-sections, test-parts, passages, paragraphs, question-groups, questions
    test-import       POST /tests/import
    media             generic R2-backed file module with per-owner policies
    student-tests     published catalogue for students (no answers)
    student-attempts  attempt lifecycle, scoring, results, Speaking audio
    grading           teacher grading queue + all-student attempts for staff
  shared/       CASL, storage, scoring (IELTS bands), throttling, decorators
  types/        shared enums and interfaces
test/           e2e specs and fixtures (Testcontainers)
```

## Database migrations

TypeORM migrations are the only owner of the schema. Every entity change needs a migration in the same PR. Always review generated SQL: a column rename is generated as drop + add, which loses data, so rewrite it as `RENAME COLUMN`. `test/migrations.e2e-spec.ts` fails if the migrated schema doesn't match the entities.

## Testing

- Unit specs live next to the code (`src/**/*.spec.ts`) and need no database.
- E2E specs in `test/` boot the real `AppModule` against a fresh database per file, with storage faked.

## CI and deployment

On every PR and push to `dev`/`main`, CI runs format check → lint → typecheck → unit → e2e → build. It then regenerates `openapi.json` and fails if the result differs from the committed file. `api-changelog.yml` posts an `oasdiff` changelog on each PR and blocks breaking changes unless the PR is labelled `api-breaking`.

All three apps deploy on Vercel. The API uses the NestJS framework preset (`pnpm build`, Node 24), with `main` → production and `dev` → the dev environment. Vercel doesn't run migrations, so run `pnpm migration:run` against the target database before merging. Environment setup and first-deploy steps are in [docs/deployment.md](docs/deployment.md).

## Conventions

- ESM with `nodenext` resolution: relative imports use explicit `.js` extensions.
- Linting and formatting use oxlint and oxfmt (not ESLint/Prettier).
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/), enforced by commitlint. Husky runs lint-staged and `tsc` before each commit.
- Responses are documented with response DTOs and `@ApiOkResponse`/`@ApiCreatedResponse`. Run `pnpm openapi:generate` and commit `openapi.json` whenever DTOs change.

## Further reading

- [CLAUDE.md](CLAUDE.md): detailed architecture notes
- [docs/auth-flow.md](docs/auth-flow.md): auth sequence diagrams
- [docs/question-formats.md](docs/question-formats.md): question types and their payloads
- [docs/student-tests-api.md](docs/student-tests-api.md): student test API
- [docs/test-schema.dbml](docs/test-schema.dbml): test content schema
- [docs/deployment.md](docs/deployment.md): Vercel deployment
