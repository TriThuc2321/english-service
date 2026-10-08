# Luồng xác thực (Auth flow)

Tài liệu mô tả luồng xác thực giữa **english-service** (BE), **english-backoffice** (BO, React SPA) và **english-student** (Next.js, server đóng vai trò BFF).

|                     | Backoffice (`client = bo`)                                                                    | Student (`client = web`)                                                             |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Access token        | Trong **memory** của SPA, gửi qua header `Authorization: Bearer`                              | Cookie httpOnly `st_access_token` trên domain student. BFF gắn Bearer khi gọi BE     |
| Refresh token       | Cookie httpOnly `refresh_token_bo` do **BE** set (path `/api/auth`, `SameSite=Lax`, `Secure`) | Cookie httpOnly `st_refresh_token` trên domain student. BFF gửi lại trong **body**   |
| Google login trả về | BE set cookie refresh rồi redirect về `/login`                                                | BE redirect kèm `?code=` (refresh token sống 60s, dùng 1 lần) và `state=clientNonce` |
| Chống login CSRF    | Cookie `oauth_state` trên domain API                                                          | `oauth_state` (API) + `oauth_nonce` (domain student)                                 |
| Endpoint CMS        | Được gọi (`@Clients(AuthClient.BO)`)                                                          | Bị 403                                                                               |

## 1. Tổng quan

```mermaid
flowchart LR
  subgraph Browser
    BO["Backoffice SPA<br/>access token in memory"]
    STB["Student browser<br/>chỉ có cookie httpOnly"]
  end

  subgraph StudentServer["english-student (Next.js)"]
    PROXY["proxy.ts<br/>/api/bff/* rewrite + auto refresh"]
    SESS["/api/session/google<br/>/api/session/google/callback"]
  end

  BE["english-service<br/>/api/auth/*  +  CMS APIs"]
  G["Google OAuth"]

  BO -- "Bearer + cookie refresh_token_bo<br/>(withCredentials)" --> BE
  STB -- "cookie st_access_token / st_refresh_token" --> PROXY
  STB --> SESS
  PROXY -- "Bearer + X-Forwarded-For" --> BE
  SESS -- "refreshToken trong body" --> BE
  BE <--> G
```

Guard chain của BE cho mọi request: `ThrottlerGuard` → `JwtAuthGuard` (bỏ qua nếu `@Public`) → `PermissionGuard` (`@Clients` + `@CheckPermissions`, mặc định deny).

## 2. Backoffice

### 2.1 Đăng nhập Google

```mermaid
sequenceDiagram
  autonumber
  actor U as Admin
  participant BO as Backoffice SPA
  participant BE as english-service
  participant G as Google

  U->>BO: Bấm "Continue with Google"
  BO->>BE: GET /api/auth/google?client=bo (full-page redirect)
  BE->>BE: Sinh nonce, Set-Cookie oauth_state (path /api/auth/google)
  BE-->>U: 302 tới Google, state = "bo.nonce"
  U->>G: Đăng nhập, đồng ý
  G-->>BE: GET /api/auth/google/callback?code&state
  BE->>BE: parseOAuthState + so nonce với cookie oauth_state, xoá cookie
  BE->>G: Đổi code lấy profile (passport)
  BE->>BE: thirdPartyLogin: user phải tồn tại và role.canAccessCms
  alt Thành công
    BE->>BE: issueTokens: tạo 1 row auth_sessions (sid, currentJti, sha256 hash)
    BE-->>U: Set-Cookie refresh_token_bo, 302 tới BO /login
    U->>BO: GET /login
    BO->>BE: _auth clientLoader: GET /auth/profile (chưa có token nên 401)
    BO->>BE: POST /auth/refresh {client:"bo"} kèm cookie
    BE-->>BO: {access_token} + Set-Cookie refresh mới (rotate)
    BO->>BO: setAccessToken (memory), retry /auth/profile
    BO-->>U: redirect "/"
  else Lỗi (nonce sai, không có quyền CMS...)
    BE-->>U: 302 tới /login?error=cms_access_denied | google_login_failed
    BO-->>U: Hiển thị Alert, không gọi refresh
  end
```

### 2.2 Gọi API, access token hết hạn, reload trang

```mermaid
sequenceDiagram
  autonumber
  participant BO as Backoffice SPA (axios)
  participant BE as english-service

  BO->>BE: GET /api/users, Authorization: Bearer access
  alt access còn hạn
    BE-->>BO: 200
  else access hết hạn, hoặc memory trống sau reload
    BE-->>BO: 401
    Note over BO: Gộp mọi request 401 vào 1 lần refresh duy nhất
    BO->>BE: POST /auth/refresh {client:"bo"} + cookie refresh_token_bo
    alt refresh hợp lệ
      BE-->>BO: {access_token} + Set-Cookie refresh mới
      BO->>BE: Retry request gốc với Bearer mới
      BE-->>BO: 200
    else refresh hỏng / bị revoke
      BE-->>BO: 401 + xoá cookie
      BO->>BO: clearAccessToken, queryClient.clear, chuyển về /login
    end
  end
```

### 2.3 Đăng xuất

```mermaid
sequenceDiagram
  autonumber
  participant BO as Backoffice SPA
  participant BE as english-service

  BO->>BE: POST /auth/logout {client:"bo"} + cookie refresh_token_bo (không cần Bearer)
  BE->>BE: verify refresh (bỏ qua hết hạn), revoke phiên theo sid
  BE-->>BO: Xoá cookie refresh_token_bo
  BO->>BO: clearAccessToken, queryClient.clear, chuyển về /login
```

## 3. Student (Next.js BFF)

### 3.1 Đăng nhập Google

```mermaid
sequenceDiagram
  autonumber
  actor S as Học sinh
  participant N as english-student server
  participant BE as english-service
  participant G as Google

  S->>N: GET /api/session/google
  N->>N: Sinh clientNonce, Set-Cookie oauth_nonce (domain student)
  N-->>S: 302 tới BE /api/auth/google?client=web&nonce=clientNonce
  S->>BE: GET /api/auth/google?client=web&nonce=...
  BE-->>S: Set-Cookie oauth_state, 302 tới Google (state = "web.nonce.clientNonce")
  S->>G: Đăng nhập
  G-->>BE: GET /api/auth/google/callback?code&state
  BE->>BE: Kiểm tra nonce với cookie oauth_state
  BE->>BE: thirdPartyLogin (tự tạo user role USER nếu chưa có)
  BE->>BE: issueLoginCode: refresh token sống 60s
  BE-->>S: 302 tới /api/session/google/callback?code=...&state=clientNonce
  S->>N: GET callback
  N->>N: So state với cookie oauth_nonce, xoá cookie
  N->>BE: POST /auth/refresh {client:"web", refreshToken: code}
  BE-->>N: {access_token, refresh_token, refresh_token_expires_at}
  N-->>S: Set-Cookie st_access_token + st_refresh_token (httpOnly, Lax), 302 tới "/"
```

### 3.2 Gọi API qua BFF và refresh tự động

```mermaid
sequenceDiagram
  autonumber
  participant S as Browser
  participant P as proxy.ts (Next server)
  participant BE as english-service

  S->>P: Request trang hoặc /api/bff/* kèm cookie st_*
  alt Có st_access_token (cookie hết hạn sớm hơn JWT 30s)
    P->>P: Dùng access token hiện có
  else Chỉ còn st_refresh_token
    P->>BE: POST /auth/refresh {client:"web", refreshToken} + X-Forwarded-For
    alt ok
      BE-->>P: Cặp token mới (rotate)
      P->>P: Ghi token mới vào request và response cookies
    else REFRESH_TOKEN_ROTATED (request song song đã rotate)
      P-->>S: Trang: redirect lại cùng URL để lấy cookie mới
    else invalid
      P->>P: clearSession, coi như chưa đăng nhập
    end
  end
  alt /api/bff/*
    P->>BE: Rewrite /api/*, xoá header cookie, gắn Bearer + X-Forwarded-For
    BE-->>S: Response (401 thì axios client chuyển về /login)
  else Trang
    P-->>S: Chưa đăng nhập thì /login, đã đăng nhập mà vào /login thì về "/"
  end
```

### 3.3 Đăng xuất

```mermaid
sequenceDiagram
  autonumber
  participant S as Browser
  participant N as Server Action logout()
  participant BE as english-service

  S->>N: Submit form logout
  N->>BE: POST /auth/logout {client:"web", refreshToken} (không cần Bearer)
  BE->>BE: Revoke phiên (sid)
  N->>N: clearSession (xoá st_*)
  N-->>S: redirect /login
```

## 4. Xoay vòng refresh token (`POST /auth/refresh`)

```mermaid
flowchart TD
  A["POST /auth/refresh {client, refreshToken?}"] --> B{"Lấy token:<br/>bo từ cookie, web từ body"}
  B -->|không có| X401["401 + xoá cookie (bo)"]
  B --> C{"verify bằng JWT_SECRET_REFRESH<br/>và payload.client == client"}
  C -->|sai| X401
  C --> E{"User ACTIVE?<br/>bo thì cần canAccessCms"}
  E -->|không| X401
  E -->|có| D["UPDATE auth_sessions SET currentJti=jti mới, tokenHash, previousJti=jti, rotatedAt, expiresAt<br/>WHERE id=sid, userId, client, currentJti=jti, tokenHash, revokedAt IS NULL, chưa hết hạn"]
  D -->|affected = 1| F["Access mới (có claim client)<br/>+ refresh mới (cùng sid, jti mới)"]
  D -->|affected = 0| S{"Phiên sid còn sống?"}
  S -->|không| X401
  S -->|có| G{"jti == previousJti<br/>và rotate trong 30s?"}
  G -->|có| R["401 REFRESH_TOKEN_ROTATED<br/>(request song song, không phạt)"]
  G -->|không| H["Token cũ của phiên bị dùng lại, nghi bị đánh cắp:<br/>revoke TẤT CẢ phiên của user"] --> X401
```
