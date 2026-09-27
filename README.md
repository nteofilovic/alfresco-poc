# Document Workspace POC — React + Spring Boot + Alfresco Community

A proof of concept for the architecture: **React app → Spring Boot API → Alfresco Content Services (Community)**.

The React app never talks to Alfresco directly. Everything goes through the Spring Boot API, which
is the only thing that knows Alfresco's REST API shapes, credentials and internal node ids.

## What it demonstrates

- **Browse / upload / download / delete** documents and folders (`NodeController`)
- **Full-text search** across the repository, backed by Alfresco's Solr index (`SearchController`)
- **Merge to PDF**: select 2+ documents in any mix of PDF, Word, Excel, JPEG, PNG or TIFF, and merge
  them into a single PDF in the chosen order (`MergeController` / `DocumentMergeService`).
  Office formats are converted to PDF by Alfresco's own Transform Service (LibreOffice under the
  hood); images are placed onto PDF pages directly with PDFBox.
- **Custom metadata**: apply an arbitrary Alfresco aspect + property values to a node
  (`PUT /api/nodes/{id}/metadata`) — the API layer that a Custom Model Manager-defined metadata
  form would call.
- **Sites + folder-structure templates**: `POST /api/sites` creates an Alfresco Collaboration Site
  and builds a caller-supplied list of subfolders (e.g. `["01 Contracts", "02 Invoices/Paid"]`)
  inside its Document Library — the "define a folder structure per project" feature on top of
  Alfresco Sites.

## Prerequisites

- Docker + Docker Compose
- Java 21, Maven (or use the wrapper once added)
- Node 20+

## Run it

**1. Start Alfresco Community** (~6-8GB RAM, first start takes a few minutes):

```bash
docker compose up -d
```

Alfresco is ready when this returns `200`:
```bash
curl http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1/probes/-ready-
```

**2. Start the Spring Boot API** (port 8081):

```bash
cd api
mvn spring-boot:run
```

**3. Start the React app** (port 5173, dev server proxies `/api` to the Spring Boot API):

```bash
cd web
npm install
npm run dev
```

Open http://localhost:5173.

## Project layout

```
docker-compose.yml   Alfresco Community: postgres, activemq, transform-core-aio, alfresco, search
api/                  Spring Boot API (Java 21)
  config/             Alfresco REST client, CORS, typed properties
  service/            AlfrescoClient (raw REST calls), AlfrescoService (DTOs + business logic),
                       DocumentMergeService (PDF merge)
  controller/         NodeController, SearchController, MergeController, SiteController
  dto/                Request/response records
web/                  React 19 + TypeScript + Vite
  src/api.ts           Typed fetch wrapper around the Spring Boot API
  src/App.tsx          Folder browser: breadcrumb, upload, search, merge-to-PDF
```

## Notes on what's simplified for a POC

- Auth is HTTP Basic against Alfresco's built-in `admin` user (`application.yml`); a real product
  needs its own user/tenant model in the Spring Boot layer instead of one shared Alfresco login.
- No AMPs or custom content model are installed; the metadata endpoint works with Alfresco's stock
  aspects (e.g. `cm:titled`) until a real content model is added.
- Multi-page TIFF images only contribute their first page to a merge.
- Community has no official clustering/HA; this compose file is for local development only.
