# Deployment

Hai môi trường, mỗi môi trường có API + Postgres riêng:

| Env  | Branch | API domain         | DB                      |
| ---- | ------ | ------------------ | ----------------------- |
| dev  | `dev`  | `api-dev.<domain>` | Postgres riêng của dev  |
| prod | `main` | `api.<domain>`     | Postgres riêng của prod |

Luồng code: `feat/*` → PR vào `dev` (deploy dev) → PR `dev` → `main` (deploy prod). CI (`ci.yml`) đã chạy cho cả hai branch.

## Việc cần làm

- [x] TypeORM migrations, bỏ `synchronize` (xem mục _Migrations_ trong `CLAUDE.md`)
- [ ] Tạo branch `dev` từ `main`, bật branch protection cho `dev` và `main` (bắt buộc CI pass)
- [ ] `Dockerfile` (multi-stage: `pnpm install --frozen-lockfile` → `pnpm build` → `pnpm prune --prod`; runtime `node dist/main`, cần giữ `node_modules/typeorm` để chạy `migration:run`)
- [ ] `railway.json`: build bằng Dockerfile, `preDeployCommand: pnpm migration:run`, healthcheck path, restart policy
- [ ] Endpoint healthcheck (`GET /api/health`, `@Public()`) cho Railway
- [ ] Tắt hoặc bảo vệ Swagger `/docs` trên prod
- [ ] Script tạo SUPER_ADMIN đầu tiên (hiện chưa có seed, xem bên dưới)
- [ ] Backup Postgres prod

## Railway

Một project, hai **Environments** (`production` ← `main`, `dev` ← `dev`). Trong mỗi environment:

1. Service **Postgres** (template Postgres của Railway).
2. Service **API** từ repo GitHub, chọn branch tương ứng, build bằng `Dockerfile`.
3. Biến môi trường của API (bảng dưới). Biến DB dùng reference: `DATABASE_HOST=${{Postgres.PGHOST}}`, `DATABASE_PORT=${{Postgres.PGPORT}}`, `DATABASE_USERNAME=${{Postgres.PGUSER}}`, `DATABASE_PASSWORD=${{Postgres.PGPASSWORD}}`, `DATABASE_NAME=${{Postgres.PGDATABASE}}`. Kết nối qua private network (`*.railway.internal`) thì `DATABASE_SSL=false`.
4. **Pre-deploy command**: `pnpm migration:run`. Migration chạy một lần trước khi bản mới nhận traffic; lỗi migration thì deploy dừng, bản cũ vẫn chạy.
5. Custom domain `api.<domain>` / `api-dev.<domain>` (Hobby cho phép 2 domain — vừa đủ).
6. Dev có thể bật **App Sleeping** để tiết kiệm.

Chi phí ước tính (Hobby $5 kèm $5 usage): API ~0.2 GB RAM + Postgres ~0.2 GB mỗi env → khoảng **$8–10/tháng** cho cả hai env.

## Biến môi trường mỗi env

Mọi secret đặt khác nhau giữa dev và prod.

| Biến                                                          | dev                                                 | prod                                            |
| ------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `DATABASE_*`                                                  | reference Postgres dev                              | reference Postgres prod                         |
| `JWT_SECRET`, `JWT_SECRET_REFRESH`                            | `openssl rand -base64 48`                           | giá trị khác dev                                |
| `GOOGLE_CLIENT_ID/SECRET`                                     | cùng OAuth client hoặc client riêng                 | OAuth client prod                               |
| `GOOGLE_CALLBACK_URL`                                         | `https://api-dev.<domain>/api/auth/google/callback` | `https://api.<domain>/api/auth/google/callback` |
| `GOOGLE_LOGIN_REDIRECT_URL_WEB` / `_BO`                       | URL callback của FE dev                             | URL callback của FE prod                        |
| `CORS_ORIGINS`                                                | `https://bo-dev.<domain>,https://dev.<domain>`      | `https://bo.<domain>,https://<domain>`          |
| `TRUST_PROXY`                                                 | phủ proxy của Railway + IP server BFF dev           | tương tự cho prod                               |
| `STORAGE_BUCKET`                                              | `myenglish-dev`                                     | `myenglish`                                     |
| `STORAGE_PUBLIC_URL`                                          | `https://media-dev.<domain>`                        | `https://media.<domain>`                        |
| `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID/SECRET_ACCESS_KEY` | R2 API token chỉ có quyền bucket dev                | token chỉ có quyền bucket prod                  |
| `STORAGE_DOWNLOAD_URL_TTL` (tuỳ chọn)                         | giây sống của URL ký sẵn, mặc định `3600`           | như dev                                         |
| `HTTPS_KEY_PATH`, `HTTPS_CERT_PATH`                           | để trống (Railway terminate TLS)                    | để trống                                        |

## Những ràng buộc dễ quên

- **HTTPS bắt buộc**: cookie refresh của BO là `secure`, chạy HTTP thì BO không refresh được.
- **Cùng registrable domain**: cookie `sameSite: 'lax'` cần API, BO và web nằm chung domain gốc (`api-dev.x.com` + `bo-dev.x.com`). Không dùng domain mặc định `*.up.railway.app` / `*.vercel.app` cho luồng đăng nhập.
- **Google Cloud Console**: thêm cả hai callback URL vào _Authorized redirect URIs_.
- **R2**: mỗi bucket cần CORS rule cho phép `PUT` từ origin BO **và origin web (học sinh)** của env đó (học sinh upload bản ghi âm Speaking trực tiếp lên R2), và gắn custom domain public (`media-dev.` / `media.`).
- **Chặn `/attempts/*` trên domain public**: bản ghi âm của học sinh nằm dưới prefix `attempts/` trong cùng bucket và chỉ được đọc qua URL ký sẵn (hết hạn sau `STORAGE_DOWNLOAD_URL_TTL`). Thêm một Cloudflare rule (WAF custom rule) chặn mọi request tới `media(-dev).<domain>` có path bắt đầu bằng `/attempts/`; nếu không, ai biết key đều nghe được.
- **Quyền chấm bài**: role giáo viên cần `READ` và `CREATE` trên subject `assessment` (hàng đợi + chấm Writing/Speaking tại `/grading`). Cấp trong CMS trước khi mở tính năng, vì quyền nằm trong JWT nên áp dụng ở lần refresh/đăng nhập kế tiếp.
- **Throttler** lưu state trong memory từng instance — chạy 1 replica; nếu scale ngang phải chuyển storage sang Redis.
- Đổi `STORAGE_PUBLIC_URL` sau khi đã có dữ liệu cần một `UPDATE users SET avatar = ...` (avatar lưu URL đầy đủ).

## Lần deploy đầu tiên của mỗi env

1. Pre-deploy chạy `Init` migration lên DB trống.
2. Khi boot, app tự upsert system roles (`SUPER_ADMIN`, `ADMIN`, `USER`) và score scales.
3. Tạo admin đầu tiên: đăng nhập Google một lần bằng tài khoản của bạn (tạo user role `USER`), rồi chạy trên DB của env đó:

   ```sql
   UPDATE users
   SET role_id = (SELECT role_id FROM roles WHERE code = 'SUPER_ADMIN')
   WHERE email = '<email của bạn>';
   ```

   Đăng nhập lại để token mang quyền mới.

## Migrations khi phát triển

Quy trình mỗi lần sửa entity:

1. Sửa entity.
2. `pnpm migration:generate src/migrations/<Name>` (so với DB trong `.env`, DB này phải đã migrate tới mới nhất).
3. Đọc lại SQL sinh ra (rename cột → sửa thành `RENAME COLUMN`; enum dùng chung → bỏ `CREATE/DROP TYPE` lặp).
4. `pnpm migration:run` lên DB local, chạy `pnpm test:e2e` (spec `migrations.e2e-spec.ts` bắt thiếu migration).
5. Commit migration cùng PR với thay đổi entity.

**DB local hiện tại** được tạo bằng `synchronize`, nên `Init` sẽ báo bảng đã tồn tại. Chọn một trong hai:

- Giữ dữ liệu: schema local đã khớp entity, đánh dấu `Init` là đã chạy mà không thực thi: `pnpm build && node --env-file=.env node_modules/typeorm/cli.js -d dist/data-source.js migration:run --fake`.
- Làm lại từ đầu: `docker compose down -v && docker compose up -d && pnpm build && pnpm migration:run` (mất dữ liệu local).

Xoá `DATABASE_SYNC` khỏi `.env` local — biến này không còn được đọc.

## Frontend (gợi ý)

BO và student web đặt trên Vercel: mỗi project gắn branch `main` vào domain prod và branch `dev` vào domain dev (`bo-dev.<domain>`, `dev.<domain>`), biến môi trường riêng cho từng branch trỏ tới API tương ứng.
