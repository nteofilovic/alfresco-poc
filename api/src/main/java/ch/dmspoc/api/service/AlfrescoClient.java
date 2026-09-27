package ch.dmspoc.api.service;

import ch.dmspoc.api.exception.AlfrescoApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

/**
 * Thin, low-level wrapper around Alfresco's public Core &amp; Search REST
 * APIs. Returns raw Jackson {@link JsonNode}s; {@link AlfrescoService} maps
 * these onto the app's own DTOs. Keeping this layer "dumb" means the whole
 * REST surface (nodes, sites, renditions, search) is reachable from one
 * place, and nothing above this class needs to know Alfresco's URL shapes.
 */
@Component
public class AlfrescoClient {

    private static final Logger log = LoggerFactory.getLogger(AlfrescoClient.class);

    private final RestClient core; // .../alfresco/versions/1
    private final RestClient search; // .../search/versions/1
    private final ObjectMapper mapper;

    public AlfrescoClient(RestClient alfrescoRestClient, RestClient alfrescoSearchRestClient, ObjectMapper mapper) {
        this.core = alfrescoRestClient;
        this.search = alfrescoSearchRestClient;
        this.mapper = mapper;
    }

    // ---------------------------------------------------------------- nodes

    public JsonNode getNode(String nodeId, String include) {
        return get("/nodes/" + enc(nodeId), mapOf("include", include));
    }

    public JsonNode listChildren(String parentId, String where, int skip, int maxItems) {
        return get("/nodes/" + enc(parentId) + "/children",
                mapOf("skipCount", skip, "maxItems", maxItems, "where", where,
                        "include", "properties,aspectNames", "orderBy", "isFolder DESC,name ASC"));
    }

    public JsonNode createFolder(String parentId, String name) {
        ObjectNode body = mapper.createObjectNode();
        body.put("name", name);
        body.put("nodeType", "cm:folder");
        return post("/nodes/" + enc(parentId) + "/children", body);
    }

    public JsonNode uploadFile(String parentId, String filename, byte[] content, String contentType, boolean overwrite) {
        MultipartBodyBuilder mb = new MultipartBodyBuilder();
        mb.part("filedata", content)
                .contentType(contentType != null ? MediaType.parseMediaType(contentType) : MediaType.APPLICATION_OCTET_STREAM)
                .filename(filename);
        mb.part("name", filename);
        mb.part("overwrite", String.valueOf(overwrite));

        return core.post()
                .uri("/nodes/" + enc(parentId) + "/children")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(mb.build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    public byte[] getContent(String nodeId) {
        return core.get()
                .uri("/nodes/" + enc(nodeId) + "/content")
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(byte[].class);
    }

    public void deleteNode(String nodeId, boolean permanent) {
        core.delete()
                .uri(uriBuilder -> uriBuilder.path("/nodes/" + enc(nodeId))
                        .queryParam("permanent", permanent).build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .toBodilessEntity();
    }

    public JsonNode updateNode(String nodeId, JsonNode body) {
        return core.put()
                .uri("/nodes/" + enc(nodeId))
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    // ------------------------------------------------------------ renditions

    public void requestRendition(String nodeId, String renditionId) {
        ObjectNode body = mapper.createObjectNode();
        body.put("id", renditionId);
        try {
            post("/nodes/" + enc(nodeId) + "/renditions", body);
        } catch (AlfrescoApiException e) {
            if (e.getStatus() != 409) { // 409 = already exists/queued, which is fine
                throw e;
            }
        }
    }

    /** Polls until the rendition is READY, then returns its bytes as PDF (or whatever mimetype it is). */
    public byte[] waitForRenditionContent(String nodeId, String renditionId, Duration timeout) {
        Instant deadline = Instant.now().plus(timeout);
        while (Instant.now().isBefore(deadline)) {
            JsonNode rendition = get("/nodes/" + enc(nodeId) + "/renditions/" + renditionId, Map.of());
            String status = rendition.path("entry").path("status").asText("");
            if ("CREATED".equals(status)) {
                return core.get()
                        .uri("/nodes/" + enc(nodeId) + "/renditions/" + renditionId + "/content")
                        .retrieve()
                        .onStatus(HttpStatusCode::isError, this::handleError)
                        .body(byte[].class);
            }
            if ("FAILED".equals(status)) {
                throw new AlfrescoApiException(422, "Rendition '" + renditionId + "' failed for node " + nodeId);
            }
            sleep(500);
        }
        throw new AlfrescoApiException(504, "Timed out waiting for rendition '" + renditionId + "' on node " + nodeId);
    }

    // ----------------------------------------------------------------- sites

    public JsonNode createSite(String id, String title, String description, String visibility) {
        ObjectNode body = mapper.createObjectNode();
        body.put("id", id);
        body.put("title", title);
        if (description != null) body.put("description", description);
        body.put("visibility", visibility != null ? visibility : "PRIVATE");
        return post("/sites", body);
    }

    public JsonNode getSiteContainer(String siteId, String containerId) {
        return get("/sites/" + enc(siteId) + "/containers/" + enc(containerId), Map.of());
    }

    public JsonNode listSites(int skip, int maxItems) {
        return get("/sites", mapOf("skipCount", skip, "maxItems", maxItems));
    }

    // ---------------------------------------------------------------- search

    public JsonNode search(String term, int maxItems) {
        String safeTerm = term.replace("\"", "");
        ObjectNode body = mapper.createObjectNode();
        ObjectNode query = body.putObject("query");
        query.put("query", "(cm:name:\"*" + safeTerm + "*\" OR TEXT:\"" + safeTerm + "\")");
        query.put("language", "afts");
        ObjectNode paging = body.putObject("paging");
        paging.put("maxItems", maxItems);
        paging.put("skipCount", 0);

        return search.post()
                .uri("/search")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    // --------------------------------------------------------------- helpers

    private JsonNode get(String path, Map<String, Object> queryParams) {
        return core.get()
                .uri(uriBuilder -> {
                    var b = uriBuilder.path(path);
                    queryParams.forEach((k, v) -> {
                        if (v != null) b.queryParam(k, v);
                    });
                    return b.build();
                })
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    private JsonNode post(String path, Object body) {
        return core.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    private void handleError(org.springframework.http.HttpRequest req,
                              org.springframework.http.client.ClientHttpResponse resp) throws java.io.IOException {
        String body = new String(resp.getBody().readAllBytes());
        log.warn("Alfresco API error {}: {}", resp.getStatusCode().value(), body);
        throw new AlfrescoApiException(resp.getStatusCode().value(), body);
    }

    private static String enc(String s) {
        return java.net.URLEncoder.encode(s, java.nio.charset.StandardCharsets.UTF_8);
    }

    private static Map<String, Object> mapOf(Object... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
