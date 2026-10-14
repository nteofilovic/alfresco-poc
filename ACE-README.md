# Alfresco Community Edition 26.2 — services

Reference for the services in `docker-compose-ACE-26.2.yaml` (full stack) and which of them
`docker-compose-ACE-26.2-min.yaml` keeps (minimal stack: repository, database, messaging, transforms and search
only). Image tags follow Alfresco's reference `community-compose.yaml` for ACS 26.2.0.

> **Search changed in 26.2.** Community now uses **Elasticsearch 8** fed by a `batch-indexing` service.
> There is no Solr / Search Services container anymore (the 25.5 and 26.1 compose files still use it).

## Start

```bash
# Full stack (~10GB RAM): everything below, behind a Traefik proxy on :8080
docker compose -f docker-compose-ACE-26.2.yaml up -d

# Minimal stack (~6GB RAM): no web clients, Kibana or proxy; Alfresco published directly on :8080
docker compose -f docker-compose-ACE-26.2-min.yaml up -d
```

Both use the same host ports, so run only one stack at a time. Each has its own volumes and starts with an
empty repository. Ready check (returns `200`):

```bash
curl http://localhost:8080/alfresco/api/-default-/public/alfresco/versions/1/probes/-ready-
```

Default Alfresco login: `admin` / `admin`.

## Services

| Service | Image | In min? | URL (host) | Description |
|---|---|---|---|---|
| alfresco | `alfresco-content-repository-community:26.2.0` | yes | http://localhost:8080/alfresco | The Content Repository. Stores documents and folders, enforces permissions, runs workflows (Activiti) and exposes the REST APIs: Core `/alfresco/api/-default-/public/alfresco/versions/1`, Search `/alfresco/api/-default-/public/search/versions/1`, readiness probe `.../versions/1/probes/-ready-`. Calls the transform service and sends content changes to the search index. |
| postgres | `postgres:17.9` | yes | `localhost:5432` (full stack only) | PostgreSQL database with repository metadata: nodes, properties, permissions, workflow state. File content lives on the `alf_data` volume of `alfresco`, not in the database. Db/user/password: `alfresco`. |
| activemq | `alfresco-activemq:6.2.6-jre17-rockylinux8` | yes | http://localhost:8161 | Message broker used for repository events and for communication with the transform service. ACS 26+ requires broker authentication: `ACTIVEMQ_ADMIN_LOGIN/PASSWORD` (`admin`/`admin`) on the broker must match `messaging.broker.username/password` on `alfresco`. The web console shows queues, which helps when transforms stall. The full stack also publishes AMQP 5672, OpenWire 61616 and STOMP 61613. |
| transform-core-aio | `alfresco-transform-core-aio:5.4.3` | yes | http://localhost:8090 (full stack only) | "All-in-one" transform engine (LibreOffice, ImageMagick, PDF renderer, Tika, ...). Converts Office documents to PDF, generates thumbnails and previews, and extracts text for indexing. Health: `/ready`. |
| elasticsearch | `elasticsearch:8.17.10` | yes | http://localhost:9200 | The search index (replaces Solr in 26.2). Holds the full-text index and metadata fields that the repository queries for the Search REST API. Single node, security disabled. Check it with `/_cluster/health`. |
| batch-indexing | `alfresco-elasticsearch-batch-indexing:5.7.0` | yes | none (internal) | Background service that reads node changes from the database and repository and pushes them to Elasticsearch (continuous reindex, polls every 15s). Without it nothing new gets indexed, so search returns stale or empty results. No healthcheck; use `docker compose logs batch-indexing`. |
| share | `alfresco-share:26.2.0` | no | http://localhost:8080/share | The classic Alfresco web client: sites, document library, dashboards and workflows. The proxy redirects `/` here. |
| content-app | `alfresco-content-app:8.0.0` | no | http://localhost:8080/content-app | Alfresco Content App (ACA), the modern Angular/ADF client for browsing and managing content. |
| control-center | `alfresco-control-center:11.0.0` | no | http://localhost:8080/control-center (also `/admin`) | Admin UI for managing users, groups and other repository settings. |
| kibana | `kibana:8.17.10` | no | http://localhost:5601 | UI over Elasticsearch for inspecting indexes and documents and running queries. Debug tool only. |
| proxy | `traefik:3.6` | no | http://localhost:8888 (dashboard) | Traefik reverse proxy that puts the web apps behind port 8080 using Docker labels: `/alfresco` → repository, `/share` → Share, `/content-app` → ACA, `/control-center` and `/admin` → Control Center, `/` → redirect to `/share`. Raises the upload size limit to 5 GB. Not needed in the min stack, where `alfresco` publishes 8080 directly. |

In the full stack the `proxy` owns host port 8080 and routes by path prefix; `alfresco` itself publishes nothing.
In the min stack `alfresco` publishes 8080 directly.

## How the services connect

```
alfresco ── postgres
    │   └── activemq ── transform-core-aio
    └────── elasticsearch ◄── batch-indexing

proxy ── alfresco, share, content-app, control-center      (full stack only)
kibana ── elasticsearch                                    (full stack only)
```

## Caveats

- The Traefik labels for Share, ACA and Control Center, and the healthchecks for Share/ACA/Control Center,
  were written from Alfresco's reference files and are not tested. If a path does not load, check the
  Traefik dashboard on :8888.
- Passwords (`admin`/`admin`, keystore, shared secret) are the published defaults — local development only.
- Community has no official clustering/HA.
