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
- **`controller/`** — `NodeController` (browse/upload/download/delete/metadata), `SearchController`
  (full-text search), `MergeController` (merge-to-PDF), `SiteController` (site + folder-template creation).
- **`config/`** — `RestClientConfig` builds the two Alfresco `RestClient`s (HTTP Basic auth against the
  `admin` user, backed by Apache HttpClient 5); `AlfrescoProperties` is the typed `alfresco.*` config;
  `CorsConfig` reads `app.cors.allowed-origins`.
- **`exception/GlobalExceptionHandler`** — translates `AlfrescoApiException` (and friends) into HTTP
  responses; this is where Alfresco error shapes get normalized for the frontend.
- Config: `api/src/main/resources/application.yml` — Alfresco base URL/credentials, `default-parent-id`
  (`-my-` = caller's Home folder, `-root-` = repository root), multipart size limits, CORS origins.

### Web layer (`web/src/`)

Small, no router/state-library yet:
- **`api.ts`** — typed fetch wrapper around the Spring Boot API; this is the single point of contact with
  the backend. Add new backend calls here, not ad-hoc `fetch`s in components.
- **`App.tsx`** — the whole UI: breadcrumb folder browser, upload, search, merge-to-PDF selection.
- **`formatters.ts`** — display formatting helpers (dates, sizes, etc.).
- Dev server proxies `/api` to `http://localhost:8081` (see `vite.config.ts`) — components call relative
  `/api/...` paths, never the Alfresco host directly.

### Docker stack (`docker-compose.yml`)

`postgres` → `activemq` + `transform-core-aio` → `alfresco` (Content Repository Community) → `search`
(Solr 6 via Alfresco Search Services), wired together with a shared secret for secure inter-service comms.
Local development only — Community has no official clustering/HA. Default Alfresco login: `admin`/`admin`.

## POC simplifications to keep in mind

- Auth is HTTP Basic against Alfresco's built-in `admin` user; there is no per-user/tenant model in the
  Spring Boot layer.
- No AMPs or custom content model are installed; the metadata endpoint (`PUT /api/nodes/{id}/metadata`)
  only works with Alfresco's stock aspects (e.g. `cm:titled`) until a real content model is added.
