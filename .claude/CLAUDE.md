# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A proof of concept for the architecture: **React app → Spring Boot API → Alfresco Content Services (Community)**.

The React app never talks to Alfresco directly. Everything goes through the Spring Boot API, which is
the only thing that knows Alfresco's REST API shapes, credentials and internal node ids.

It demonstrates: browse/upload/download/delete of documents and folders, full-text search (Solr-backed),
merge-to-PDF across mixed formats (PDF/Word/Excel/JPEG/PNG/TIFF), custom Alfresco aspect/property
metadata updates, and creating an Alfresco Collaboration Site with a caller-supplied folder-structure
template.

## Commands

**Start the stack (order matters):**

```bash
docker compose up -d                                                    # Alfresco Community (~6-8GB RAM, first start takes minutes)
curl http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1/probes/-ready-  # wait for 200
cd api && mvn spring-boot:run                                           # Spring Boot API, port 8081
cd web && npm install && npm run dev                                    # React dev server, port 5173, proxies /api -> 8081
```

**API (Java 21 / Maven, in `api/`):**
- `mvn spring-boot:run` — run the API
- `mvn test` — run all tests
- `mvn test -Dtest=ClassName#methodName` — run a single test
- `mvn package` — build the jar

**Web (in `web/`):**
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build` (typecheck is part of the build)
- `npm run lint` — Oxlint
- `npm run preview` — preview a production build

There is no test suite in `web/` currently.

## Architecture

### API layer (`api/src/main/java/ch/dmspoc/api/`)

Three-layer separation, in call order `controller -> service (AlfrescoService) -> service (AlfrescoClient)`:

- **`service/AlfrescoClient`** — thin, deliberately "dumb" wrapper around Alfresco's public Core & Search
  REST APIs. Returns raw Jackson `JsonNode`s. Holds two `RestClient`s: `core` (`.../alfresco/versions/1`)
  and `search` (`.../search/versions/1`). This is the *only* place that knows Alfresco's URL shapes —
  nothing above it does.
- **`service/AlfrescoService`** — maps `AlfrescoClient`'s raw JSON onto the app's own DTOs; holds business
  logic (e.g. resolving folder-template paths, site setup).
- **`service/DocumentMergeService`** — PDF merge logic: converts Office formats to PDF via Alfresco's own
  Transform Service (LibreOffice-backed, called through `AlfrescoClient`), places images directly onto PDF
  pages with PDFBox. Multi-page TIFFs only contribute their first page.
- **`service/WorkspaceService`** — the single "Workspace" Share site (`zapis-workspace`) whose document
  library holds the admin-designed folder tree. `findInWorkspace(nodeId)` is how scope is checked.
- **`controller/`** — `NodeController` (browse/upload/download/preview/rename/move/copy/delete/metadata),
  `SearchController`, `MergeController`, `SiteController`, `AuthController` (login/logout/me),
  `ProfileController` (own profile + password), `WorkspaceController` (`GET /api/workspace`,
  admin `POST /api/admin/workspace`), `AdminUserController` (`/api/admin/users`).
- **`config/`** — `RestClientConfig` builds the two Alfresco `RestClient`s (HTTP Basic auth with the
  shared service account from `alfresco.username/password`, Apache HttpClient 5); `AlfrescoProperties`
  is the typed `alfresco.*` config; `CorsConfig` reads `app.cors.allowed-origins` **and registers all
  interceptors** (see below).
- **`exception/GlobalExceptionHandler`** — translates `AlfrescoApiException` (and friends) into HTTP
  responses; this is where Alfresco error shapes get normalized for the frontend.
- Config: `api/src/main/resources/application.yml` — Alfresco base URL/credentials, `default-parent-id`
  (`-my-` = caller's Home folder, `-root-` = repository root), multipart size limits, CORS origins.

### Auth and access control (cross-cutting, spans several files)

Login is `POST /api/auth/login`: credentials are validated against Alfresco, then stored as HTTP-session
attributes (`AuthController.SESSION_*`: user, isAdmin, firstName). Every later Alfresco call is made as
the **shared service account**, not the logged-in user — so the interceptors are the *only* authorization:
- `AuthInterceptor` — `/api/**` except `/api/auth/**` needs a logged-in session (401).
- `AdminInterceptor` — `/api/admin/**` needs an admin session (403).
- `WorkspaceScopeInterceptor` — `/api/nodes/**` for non-admins: node must be inside the workspace library,
  and non-admins cannot create/delete/rename/move/copy folders or use `/recent` / `/root/children`.
  Controllers like `SearchController`/`MergeController` also check the admin session flag themselves.

When adding an endpoint, decide which of these apply; path variables must be named `nodeId` or `parentId`
for the scope interceptor to find them. CORS has `allowCredentials(true)` so the session cookie flows.

### Web layer (`web/src/`)

Small, no router/state-library yet:
- **`api.ts`** — typed fetch wrapper around the Spring Boot API; this is the single point of contact with
  the backend. Add new backend calls here, not ad-hoc `fetch`s in components.
- **`App.tsx`** — top-level UI: login gate (`LoginForm`), breadcrumb folder browser, upload, search,
  merge-to-PDF selection, split-view preview. Views like `AdministrationPage` (workspace builder, user
  management) and `ProfilePage` live in `components/`.
- **`formatters.ts`** — display formatting helpers (dates, sizes, etc.).
- Dev server proxies `/api` to `http://localhost:8081` (see `vite.config.ts`) — components call relative
  `/api/...` paths, never the Alfresco host directly.

### Docker stack (`docker-compose.yml`)

`postgres` → `activemq` + `transform-core-aio` → `alfresco` (Content Repository Community) → `search`
(Solr 6 via Alfresco Search Services), wired together with a shared secret for secure inter-service comms.
Local development only — Community has no official clustering/HA. Default Alfresco login: `admin`/`admin`.

## POC simplifications to keep in mind

- The API talks to Alfresco as one shared `admin` service account; per-user identity exists only in the
  Spring session, and workspace scoping is enforced in the API (see Auth section), not by Alfresco ACLs.
- There is no test suite in `api/` either (no `src/test`), so `mvn test` currently runs nothing.
- No AMPs or custom content model are installed; the metadata endpoint (`PUT /api/nodes/{id}/metadata`)
  only works with Alfresco's stock aspects (e.g. `cm:titled`) until a real content model is added.
