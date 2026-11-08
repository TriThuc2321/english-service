# Auth flow

This document describes authentication between **english-service** (BE), **english-backoffice** (BO, React SPA) and **english-student** (Next.js, whose server acts as a BFF).

|                     | Backoffice (`client = bo`)                                                                        | Student (`client = web`)                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Access token        | Held in the SPA's **memory**, sent as `Authorization: Bearer`                                     | httpOnly cookie `st_access_token` on the student domain. The BFF attaches the Bearer header   |
| Refresh token       | httpOnly cookie `refresh_token_bo` set by the **BE** (path `/api/auth`, `SameSite=Lax`, `Secure`) | httpOnly cookie `st_refresh_token` on the student domain. The BFF sends it in the **body**    |
| Google login result | BE sets the refresh cookie and redirects to `/login`                                              | BE redirects with `?code=` (a single-use refresh token valid for 60s) and `state=clientNonce` |
| Login CSRF defence  | `oauth_state` cookie on the API domain                                                            | `oauth_state` (API) + `oauth_nonce` (student domain)                                          |
| CMS endpoints       | Allowed (`@Clients(AuthClient.BO)`)                                                               | 403                                                                                           |

## 1. Overview

```mermaid
flowchart LR
  subgraph Browser
    BO["Backoffice SPA<br/>access token in memory"]
    STB["Student browser<br/>httpOnly cookies only"]
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
  SESS -- "refreshToken in body" --> BE
  BE <--> G
```

The BE guard chain for every request: `ThrottleGuard` → `JwtAuthGuard` (skipped for `@Public`) → `PermissionGuard` (`@Clients` + `@CheckPermissions`, deny by default).

## 2. Backoffice

### 2.1 Google login

```mermaid
sequenceDiagram
  autonumber
  actor U as Admin
  participant BO as Backoffice SPA
  participant BE as english-service
  participant G as Google

  U->>BO: Click "Continue with Google"
  BO->>BE: GET /api/auth/google?client=bo (full-page redirect)
  BE->>BE: Generate nonce, Set-Cookie oauth_state (path /api/auth/google)
  BE-->>U: 302 to Google, state = "bo.nonce"
  U->>G: Sign in, consent
  G-->>BE: GET /api/auth/google/callback?code&state
  BE->>BE: parseOAuthState + compare nonce with oauth_state cookie, clear cookie
  BE->>G: Exchange code for profile (passport)
  BE->>BE: thirdPartyLogin: user must exist and role.canAccessCms
  alt Success
    BE->>BE: issueTokens: create one auth_sessions row (sid, currentJti, sha256 hash)
    BE-->>U: Set-Cookie refresh_token_bo, 302 to BO /login
    U->>BO: GET /login
    BO->>BE: _auth clientLoader: GET /auth/profile (no token yet, so 401)
    BO->>BE: POST /auth/refresh {client:"bo"} with cookie
    BE-->>BO: {access_token} + Set-Cookie new refresh (rotated)
    BO->>BO: setAccessToken (memory), retry /auth/profile
    BO-->>U: redirect "/"
  else Error (bad nonce, no CMS access...)
    BE-->>U: 302 to /login?error=cms_access_denied | google_login_failed
    BO-->>U: Show an Alert, don't call refresh
  end
```

### 2.2 API calls, access token expiry, page reload

```mermaid
sequenceDiagram
  autonumber
  participant BO as Backoffice SPA (axios)
  participant BE as english-service

  BO->>BE: GET /api/users, Authorization: Bearer access
  alt access still valid
    BE-->>BO: 200
  else access expired, or memory empty after reload
    BE-->>BO: 401
    Note over BO: All 401 requests share a single refresh
    BO->>BE: POST /auth/refresh {client:"bo"} + cookie refresh_token_bo
    alt refresh valid
      BE-->>BO: {access_token} + Set-Cookie new refresh
      BO->>BE: Retry the original request with the new Bearer
      BE-->>BO: 200
    else refresh broken / revoked
      BE-->>BO: 401 + clear cookie
      BO->>BO: clearAccessToken, queryClient.clear, go to /login
    end
  end
```

### 2.3 Logout

```mermaid
sequenceDiagram
  autonumber
  participant BO as Backoffice SPA
  participant BE as english-service

  BO->>BE: POST /auth/logout {client:"bo"} + cookie refresh_token_bo (no Bearer needed)
  BE->>BE: verify refresh (ignoring expiry), revoke the session by sid
  BE-->>BO: Clear cookie refresh_token_bo
  BO->>BO: clearAccessToken, queryClient.clear, go to /login
```

## 3. Student (Next.js BFF)

### 3.1 Google login

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  participant N as english-student server
  participant BE as english-service
  participant G as Google

  S->>N: GET /api/session/google
  N->>N: Generate clientNonce, Set-Cookie oauth_nonce (student domain)
  N-->>S: 302 to BE /api/auth/google?client=web&nonce=clientNonce
  S->>BE: GET /api/auth/google?client=web&nonce=...
  BE-->>S: Set-Cookie oauth_state, 302 to Google (state = "web.nonce.clientNonce")
  S->>G: Sign in
  G-->>BE: GET /api/auth/google/callback?code&state
  BE->>BE: Check nonce against oauth_state cookie
  BE->>BE: thirdPartyLogin (creates a USER-role user if missing)
  BE->>BE: issueLoginCode: refresh token valid for 60s
  BE-->>S: 302 to /api/session/google/callback?code=...&state=clientNonce
  S->>N: GET callback
  N->>N: Compare state with oauth_nonce cookie, clear cookie
  N->>BE: POST /auth/refresh {client:"web", refreshToken: code}
  BE-->>N: {access_token, refresh_token, refresh_token_expires_at}
  N-->>S: Set-Cookie st_access_token + st_refresh_token (httpOnly, Lax), 302 to "/"
```

### 3.2 API calls through the BFF and automatic refresh

```mermaid
sequenceDiagram
  autonumber
  participant S as Browser
  participant P as proxy.ts (Next server)
  participant BE as english-service

  S->>P: Page request or /api/bff/* with st_* cookies
  alt Has st_access_token (cookie expires 30s before the JWT)
    P->>P: Use the current access token
  else Only st_refresh_token left
    P->>BE: POST /auth/refresh {client:"web", refreshToken} + X-Forwarded-For
    alt ok
      BE-->>P: New token pair (rotated)
      P->>P: Write new tokens into request and response cookies
    else REFRESH_TOKEN_ROTATED (a parallel request already rotated)
      P-->>S: Page: redirect to the same URL to pick up the new cookies
    else invalid
      P->>P: clearSession, treat as signed out
    end
  end
  alt /api/bff/*
    P->>BE: Rewrite to /api/*, drop the cookie header, attach Bearer + X-Forwarded-For
    BE-->>S: Response (on 401 the axios client goes to /login)
  else Page
    P-->>S: Signed out → /login; signed in and visiting /login → "/"
  end
```

### 3.3 Logout

```mermaid
sequenceDiagram
  autonumber
  participant S as Browser
  participant N as Server Action logout()
  participant BE as english-service

  S->>N: Submit logout form
  N->>BE: POST /auth/logout {client:"web", refreshToken} (no Bearer needed)
  BE->>BE: Revoke the session (sid)
  N->>N: clearSession (delete st_*)
  N-->>S: redirect /login
```

## 4. Refresh token rotation (`POST /auth/refresh`)

```mermaid
flowchart TD
  A["POST /auth/refresh {client, refreshToken?}"] --> B{"Read token:<br/>bo from cookie, web from body"}
  B -->|missing| X401["401 + clear cookie (bo)"]
  B --> C{"verify with JWT_SECRET_REFRESH<br/>and payload.client == client"}
  C -->|invalid| X401
  C --> E{"User ACTIVE?<br/>bo also needs canAccessCms"}
  E -->|no| X401
  E -->|yes| D["UPDATE auth_sessions SET currentJti=new jti, tokenHash, previousJti=jti, rotatedAt, expiresAt<br/>WHERE id=sid, userId, client, currentJti=jti, tokenHash, revokedAt IS NULL, not expired"]
  D -->|affected = 1| F["New access (with client claim)<br/>+ new refresh (same sid, new jti)"]
  D -->|affected = 0| S{"Session sid still alive?"}
  S -->|no| X401
  S -->|yes| G{"jti == previousJti<br/>and rotated within 30s?"}
  G -->|yes| R["401 REFRESH_TOKEN_ROTATED<br/>(parallel request, not punished)"]
  G -->|no| H["An old token of the session was reused, likely stolen:<br/>revoke ALL of the user's sessions"] --> X401
```
