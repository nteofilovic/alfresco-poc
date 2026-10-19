# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A proof of concept for the architecture: **React app → Spring Boot API → Alfresco Content Services (Community)**.

The React app never talks to Alfresco directly. Everything goes through the Spring Boot API, which is
the only thing that knows Alfresco's REST API shapes, credentials and internal node ids.

It demonstrates: browse/upload/download/delete of documents and folders, full-text search (Solr-backed),
merge-to-PDF across mixed formats (PDF/Word/Excel/JPEG/PNG/TIFF), custom Alfresco aspect/property
metadata updates, and Spaces: business areas of a company (Clients, Suppliers, Finance...), each one an
Alfresco Collaboration Site created by an admin with a member list. A space starts empty: members fill it by
creating folders from admin-designed **folder templates** (Client, Property, Owner...) in the folder they
are browsing.

App navigation is **Home / Spaces / Tasks / Administration**. Who sees which space and document is decided
by Alfresco itself (site membership + ACLs), because content calls run with the logged-in user's ticket.

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

- **`service/AlfrescoClient`** — thin, deliberately "dumb" wrapper around Alfresco's public Core, Search
  and Workflow REST APIs. Returns raw Jackson `JsonNode`s. This is the *only* place that knows Alfresco's
  URL shapes. It is not a bean itself: `config/AlfrescoClientConfig` builds two instances — the `@Primary`
  **user** client (authenticated per request with the logged-in user's ticket) and
  `@Qualifier("serviceAlfrescoClient")` (the shared service account). Use the service one only for what a
  regular user cannot do: create sites/people, list all people, manage site members, drive the workflow engine.
- **`service/AlfrescoService`** — maps `AlfrescoClient`'s raw JSON onto the app's own DTOs; holds business
  logic (e.g. resolving folder-template paths, site setup).
- **`service/DocumentMergeService`** — PDF merge logic: converts Office formats to PDF via Alfresco's own
  Transform Service (LibreOffice-backed, called through `AlfrescoClient`), places images directly onto PDF
  pages with PDFBox. Multi-page TIFFs only contribute their first page.
- **`service/SpaceService`** — Spaces = Share sites. Lists the caller's spaces (`GET /api/spaces`, their own
  ticket), admin create / delete / members (service account).
  Default visibility is PRIVATE, so non-members cannot read; PUBLIC/MODERATED sites are readable by everyone.
- **`service/FolderTemplateService`** — folder templates (name + fixed subfolder tree), global to all spaces,
  stored as one JSON file `Company Home/zapis-config/folder-templates.json` (via `ConfigStore`, which reads
  and writes the small JSON files in `zapis-config` with the service account). Admin CRUD at
  `/api/admin/folder-templates`, list at `GET /api/folder-templates`. Members instantiate with
  `POST /api/nodes/{parentId}/from-template` (`AlfrescoService.createFromTemplate`, user ticket): the top
  folder gets `cm:description = zapis-template:<name>` (`TEMPLATE_MARK`, members may rename/move/delete it),
  its subfolders get `STRUCTURE_MARK` (locked for non-admins).
- **`service/AnnotationStore` + `PdfAnnotationService`** — PDF annotations never modify the original. The
  browser (pdf.js) produces an annotated PDF; `PdfAnnotationService` validates it against the original (same
  page count) and adds sticky notes as Text annotations. The result is stored as a sidecar
  `zapis-config/annotations/<nodeId>.pdf` + `<nodeId>.json` (`baseVersion`, `updatedBy`, `revision`) via
  `ConfigStore` (service account), so `AlfrescoService` first checks the caller's own read/`update` rights with
  their ticket. Annotations are shared per document; a save needs the current `baseRevision` (409 otherwise)
  and re-bases them on the document's current version; `outdated` = the original got a new version since.
  Endpoints: `GET/PUT/DELETE /api/nodes/{id}/annotations`, `GET .../annotations/content` (preview),
  `GET /api/nodes/{id}/content?annotations=true` (download with annotations; plain `/content` is the original).
  A permanent delete removes the sidecar; a trash delete keeps it (restore keeps the node id); copies start
  without annotations.
- **`service/AppearanceService`** — app styles (whole-app layouts `three-pane` | `command-bar`), stored in
  `zapis-config/appearance.json`: admin default + `allowUserChoice` (`/api/admin/appearance`), each user's own
  choice by username (`PUT /api/appearance/me`, 403 while locked). `GET /api/appearance` returns the effective
  style; users' choices are kept while locked and apply again when choice is re-enabled.
- **`service/TaskService`** — tasks on Alfresco's `activitiAdhoc` workflow (driven by the service account).
  A task carries its space (`zapisSiteId` variable, derived from the first attachment if not given) and each
  attachment is flagged `accessible` using the *user's* ticket, so non-members see "no access", not the name.
- **`controller/`** — `NodeController` (browse/upload/download/preview/rename/move/copy/delete/metadata),
  `SearchController` (all spaces, optional `siteId`), `MergeController`, `SpaceController` (`GET /api/spaces`,
  admin `/api/admin/spaces` + members), `AuthController` (login/logout/me), `ProfileController` (own
  profile + password), `AdminUserController` (`/api/admin/users`), `TaskController`, `AppearanceController`.
- **`config/`** — `RestClientConfig` builds the service `RestClient`s (HTTP Basic, service account from
  `alfresco.username/password`) and the per-user ones (interceptor adds `Basic ROLE_TICKET:<ticket>` from
  `UserTicketContext`); `AlfrescoProperties` is the typed `alfresco.*` config; `CorsConfig` reads
  `app.cors.allowed-origins` **and registers all interceptors** (see below).
- **`exception/GlobalExceptionHandler`** — translates `AlfrescoApiException` (and friends) into HTTP
  responses; this is where Alfresco error shapes get normalized for the frontend.
- Config: `api/src/main/resources/application.yml` — Alfresco base URL/credentials, `default-parent-id`
  (`-my-` = caller's Home folder, `-root-` = repository root), multipart size limits, CORS origins.

### Auth and access control (cross-cutting, spans several files)

Login is `POST /api/auth/login`: credentials are exchanged with Alfresco for a **login ticket**
(`POST /authentication/versions/1/tickets`), stored in the HTTP session with user, isAdmin, firstName
(`AuthController.SESSION_*`). Content calls then run **as that user**, so Alfresco's ACLs decide who can
read or write what; the interceptors only add what ACLs don't express:
- `AuthInterceptor` — `/api/**` except `/api/auth/**` needs a session with a ticket (401) and puts the
  ticket in `UserTicketContext` (thread-local) for the request; it must stay registered before the others.
- `AdminInterceptor` — `/api/admin/**` needs an admin session (403).
- `WorkspaceScopeInterceptor` (name is historical) — `/api/nodes/**` for non-admins: no plain folder
  creation and no folder delete/rename/move/copy unless it is the top folder of a template instance
  (`TEMPLATE_MARK`); no `/recent`, `/root/children` or `-my-`/`-root-` aliases.
- `GlobalExceptionHandler` — an Alfresco 401 (expired ticket) invalidates the session and returns 401.

When adding an endpoint, decide whether it needs the user client (default) or the service client; path
variables must be named `nodeId` or `parentId` for the scope interceptor to find them. CORS has
`allowCredentials(true)` so the session cookie flows.

### Web layer (`web/src/`)

Small, no router/state-library yet:
- **`api.ts`** — typed fetch wrapper around the Spring Boot API; this is the single point of contact with
  the backend. Add new backend calls here, not ad-hoc `fetch`s in components.
- **`App.tsx`** — top-level UI: login gate (`LoginForm`), views `home | spaces | tasks | admin | profile`
  (`Sidebar.View`), and inside a space the breadcrumb folder browser, upload, merge-to-PDF selection,
  split-view preview. Search is global (all spaces the user can read). `HomePage`, `SpacesPage`,
  `TasksPage` (one list of all the user's tasks, space chip + filter), `AdministrationPage`
  (tabs Spaces | Users | Application; Spaces tab = `SpacesAdmin` + `FolderTemplatesAdmin`, Users tab =
  `UsersAdmin`, Application tab = `ApplicationAdmin`) and `ProfilePage` (details, Appearance, password) live in
  `components/`. The Toolbar "New" menu lists one "New <template>" entry per folder template
  (`NewFromTemplateDialog`).
- **App styles** — `App.tsx` renders one of two shells around the same pages, from `/api/appearance`
  (cached in localStorage to avoid a flash): `three-pane` = `Sidebar` + `Topbar` (search field), and
  `command-bar` = `CommandBar` header (tabs, spaces menu) + `CommandPalette` (Ctrl/⌘ K: search, go to,
  spaces, create in the current folder, recent documents, switch layout). Styles are listed in `appStyles.ts`;
  `StylePicker` is the shared picker. CSS is scoped with `.shell-three-pane` / `.shell-command-bar`.
- **`formatters.ts`** — display formatting helpers (dates, sizes, etc.).
- Dev server proxies `/api` to `http://localhost:8081` (see `vite.config.ts`) — components call relative
  `/api/...` paths, never the Alfresco host directly.

### Docker stack (`docker-compose.yml`)

`postgres` → `activemq` + `transform-core-aio` → `alfresco` (Content Repository Community) → `search`
(Solr 6 via Alfresco Search Services), wired together with a shared secret for secure inter-service comms.
Local development only — Community has no official clustering/HA. Default Alfresco login: `admin`/`admin`.

## POC simplifications to keep in mind

- Workflow/task calls and admin operations still use the shared `admin` service account; the real task
  creator is kept in a process variable and task visibility is enforced in `TaskService`.
- Only a few API unit tests exist (`api/src/test`); there is no integration suite. Per-user access was
  verified by hand against a live stack (two users, one space each, task with a cross-space attachment).
- The ticket lives in the in-memory HTTP session, so restarting the API logs everyone out. The existing
  `zapis-workspace` site (PUBLIC) appears as a space that every user can read; change its visibility or
  members in Share if that is not wanted.
- No AMPs or custom content model are installed; the metadata endpoint (`PUT /api/nodes/{id}/metadata`)
  only works with Alfresco's stock aspects (e.g. `cm:titled`) until a real content model is added.

## Git conventions

Commit messages follow Conventional Commits with a bullet-point body. Full rules:
@.claude/rules/git-conventions.md
