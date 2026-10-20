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
 *
 * <p>Not a bean itself: AlfrescoClientConfig builds a per-user instance (the primary one) and a
 * service-account instance, from differently authenticated RestClients.
 */
public class AlfrescoClient {

    private static final Logger log = LoggerFactory.getLogger(AlfrescoClient.class);

    private final RestClient core; // .../alfresco/versions/1
    private final RestClient search; // .../search/versions/1
    private final RestClient service; // .../alfresco/service (legacy webscripts)
    private final RestClient workflow; // .../workflow/versions/1
    private final ObjectMapper mapper;

    public AlfrescoClient(RestClient alfrescoRestClient, RestClient alfrescoSearchRestClient,
                          RestClient alfrescoServiceRestClient, RestClient alfrescoWorkflowRestClient,
                          ObjectMapper mapper) {
        this.core = alfrescoRestClient;
        this.search = alfrescoSearchRestClient;
        this.service = alfrescoServiceRestClient;
        this.workflow = alfrescoWorkflowRestClient;
        this.mapper = mapper;
    }

    // ---------------------------------------------------------------- nodes

    public JsonNode getNode(String nodeId, String include) {
        return get("/nodes/" + enc(nodeId), mapOf("include", include));
    }

    /** The node at {@code relativePath} below {@code parentId} (a name or a path of names), or null when there is none. */
    public JsonNode findByRelativePath(String parentId, String relativePath) {
        try {
            return get("/nodes/" + enc(parentId), mapOf("relativePath", relativePath)).path("entry");
        } catch (AlfrescoApiException e) {
            if (e.getStatus() == 404) return null;
            throw e;
        }
    }

    public JsonNode listChildren(String parentId, String where, int skip, int maxItems) {
        return listChildren(parentId, where, skip, maxItems, "isFolder DESC,name ASC");
    }

    /** @param orderBy Alfresco orderBy expression; the raw response includes {@code list.pagination} */
    public JsonNode listChildren(String parentId, String where, int skip, int maxItems, String orderBy) {
        return get("/nodes/" + enc(parentId) + "/children",
                mapOf("skipCount", skip, "maxItems", maxItems, "where", where,
                        "include", "properties,aspectNames", "orderBy", orderBy));
    }

    public JsonNode createFolder(String parentId, String name) {
        return createFolder(parentId, name, null);
    }

    /** @param description stored as cm:description; used to tag admin-designed structure folders */
    public JsonNode createFolder(String parentId, String name, String description) {
        ObjectNode body = mapper.createObjectNode();
        body.put("name", name);
        body.put("nodeType", "cm:folder");
        if (description != null) body.putObject("properties").put("cm:description", description);
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

    /** Replaces the content of an existing file; Alfresco keeps the previous content as an earlier version. */
    public JsonNode updateContent(String nodeId, byte[] content, String contentType, String comment) {
        return core.put()
                .uri(uri -> uri.path("/nodes/{id}/content")
                        .queryParam("majorVersion", "true")
                        .queryParam("comment", comment)
                        .build(nodeId))
                .contentType(MediaType.parseMediaType(contentType))
                .body(content)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    public JsonNode moveNode(String nodeId, String targetParentId) {
        return nodeAction(nodeId, "move", targetParentId);
    }

    public JsonNode copyNode(String nodeId, String targetParentId) {
        return nodeAction(nodeId, "copy", targetParentId);
    }

    private JsonNode nodeAction(String nodeId, String action, String targetParentId) {
        ObjectNode body = mapper.createObjectNode();
        body.put("targetParentId", targetParentId);
        return post("/nodes/" + enc(nodeId) + "/" + action, body);
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

    // -------------------------------------------------------------- workflow

    /** Starts a process by definition key (e.g. activitiAdhoc) with the given start variables. */
    public JsonNode startProcess(String definitionKey, Map<String, Object> variables) {
        ObjectNode body = mapper.createObjectNode();
        body.put("processDefinitionKey", definitionKey);
        body.set("variables", mapper.valueToTree(variables));
        return wfPost("/processes", body);
    }

    public JsonNode getProcess(String processId) {
        return wfGet("/processes/" + enc(processId), Map.of());
    }

    /** {@code where} uses the workflow API syntax, e.g. {@code (status='any' AND variables/x = 'd_text y')}. */
    public JsonNode listProcesses(String where) {
        return wfGet("/processes", mapOf("where", where, "maxItems", 1000));
    }

    public void deleteProcess(String processId) {
        wfDelete("/processes/" + enc(processId));
    }

    /** All variables of a process; works for finished processes too (history). */
    public JsonNode listProcessVariables(String processId) {
        return wfGet("/processes/" + enc(processId) + "/variables", mapOf("maxItems", 1000));
    }

    /** Creates or replaces a process-scoped variable. Names must not use an unregistered "prefix_" form. */
    public JsonNode setProcessVariable(String processId, String name, String type, Object value) {
        ObjectNode body = mapper.createObjectNode();
        body.put("name", name);
        body.put("type", type);
        body.set("value", mapper.valueToTree(value));
        return wfPut("/processes/" + enc(processId) + "/variables/" + enc(name), body);
    }

    /** Active and finished tasks of a process ({@code /processes/{id}/tasks} would only list the active ones). */
    public JsonNode listProcessTasks(String processId) {
        return listTasks("(status='any' AND processId='" + processId.replace("'", "") + "')");
    }

    public JsonNode addProcessItems(String processId, java.util.List<String> nodeIds) {
        var body = mapper.createArrayNode();
        nodeIds.forEach(id -> body.addObject().put("id", id));
        return wfPost("/processes/" + enc(processId) + "/items", body);
    }

    public JsonNode listProcessItems(String processId) {
        return wfGet("/processes/" + enc(processId) + "/items", mapOf("maxItems", 1000));
    }

    /** {@code where} uses the workflow API syntax, e.g. {@code (status='any' AND assignee='bob')}. */
    public JsonNode listTasks(String where) {
        return wfGet("/tasks", mapOf("where", where, "maxItems", 1000));
    }

    public JsonNode getTask(String taskId) {
        return wfGet("/tasks/" + enc(taskId), Map.of());
    }

    /** Variables of one scope ("local" or "global") of a task. */
    public JsonNode listTaskVariables(String taskId, String scope) {
        return wfGet("/tasks/" + enc(taskId) + "/variables", mapOf("where", "(scope='" + scope + "')", "maxItems", 1000));
    }

    public JsonNode setTaskVariable(String taskId, String name, String type, Object value, String scope) {
        ObjectNode body = mapper.createObjectNode();
        body.put("name", name);
        body.put("type", type);
        body.set("value", mapper.valueToTree(value));
        body.put("scope", scope);
        return wfPut("/tasks/" + enc(taskId) + "/variables/" + enc(name), body);
    }

    /** Moves a task to the given state (completed, resolved, claimed, unclaimed...). */
    public JsonNode setTaskState(String taskId, String state) {
        ObjectNode body = mapper.createObjectNode();
        body.put("state", state);
        return workflow.put()
                .uri(uriBuilder -> uriBuilder.path("/tasks/" + enc(taskId)).queryParam("select", "state").build())
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

    public void deleteSite(String siteId) {
        core.delete()
                .uri(uriBuilder -> uriBuilder.path("/sites/" + enc(siteId)).queryParam("permanent", true).build())
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .toBodilessEntity();
    }

    public JsonNode getSiteContainer(String siteId, String containerId) {
        return get("/sites/" + enc(siteId) + "/containers/" + enc(containerId), Map.of());
    }

    public JsonNode listSites(int skip, int maxItems) {
        return get("/sites", mapOf("skipCount", skip, "maxItems", maxItems));
    }

    /** Sites the calling user is a member of (with their role in each). */
    public JsonNode listMySites(int maxItems) {
        return get("/people/-me-/sites", mapOf("maxItems", maxItems));
    }

    public JsonNode listSiteMembers(String siteId) {
        return get("/sites/" + enc(siteId) + "/members", mapOf("maxItems", 1000));
    }

    /** @param role SiteManager | SiteCollaborator | SiteContributor | SiteConsumer */
    public JsonNode addSiteMember(String siteId, String personId, String role) {
        ObjectNode body = mapper.createObjectNode();
        body.put("id", personId);
        body.put("role", role);
        return post("/sites/" + enc(siteId) + "/members", body);
    }

    public JsonNode updateSiteMember(String siteId, String personId, String role) {
        ObjectNode body = mapper.createObjectNode();
        body.put("role", role);
        return put("/sites/" + enc(siteId) + "/members/" + enc(personId), body);
    }

    public void removeSiteMember(String siteId, String personId) {
        core.delete()
                .uri("/sites/" + enc(siteId) + "/members/" + enc(personId))
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .toBodilessEntity();
    }

    // ---------------------------------------------------------------- people

    public JsonNode createPerson(String id, String firstName, String lastName, String email, String password) {
        ObjectNode body = mapper.createObjectNode();
        body.put("id", id);
        body.put("firstName", firstName);
        if (lastName != null && !lastName.isBlank()) body.put("lastName", lastName);
        body.put("email", email);
        body.put("password", password);
        body.put("enabled", true);
        return post("/people", body);
    }

    public JsonNode getPerson(String id) {
        return get("/people/" + enc(id), Map.of());
    }

    public JsonNode updatePerson(String id, String firstName, String lastName, String email) {
        ObjectNode body = mapper.createObjectNode();
        body.put("firstName", firstName);
        body.put("lastName", lastName != null ? lastName : "");
        body.put("email", email);
        return put("/people/" + enc(id), body);
    }

    public JsonNode listPeople() {
        return get("/people", mapOf("maxItems", 1000, "orderBy", "id ASC"));
    }

    public JsonNode setPersonEnabled(String id, boolean enabled) {
        ObjectNode body = mapper.createObjectNode();
        body.put("enabled", enabled);
        return put("/people/" + enc(id), body);
    }

    /** The public v1 REST API has no "delete person", so this uses the legacy people webscript. */
    public void deletePerson(String id) {
        service.delete()
                .uri("/api/people/" + enc(id))
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .toBodilessEntity();
    }

    public JsonNode updatePersonPassword(String id, String newPassword) {
        ObjectNode body = mapper.createObjectNode();
        body.put("password", newPassword);
        return put("/people/" + enc(id), body);
    }

    // ---------------------------------------------------------------- search

    public JsonNode search(String term, int maxItems) {
        return search(term, maxItems, null);
    }

    /** @param siteId when non-null, only matches inside that Share site are returned */
    public JsonNode search(String term, int maxItems, String siteId) {
        String safeTerm = term.replace("\"", "");
        ObjectNode body = mapper.createObjectNode();
        ObjectNode query = body.putObject("query");
        String afts = "(cm:name:\"*" + safeTerm + "*\" OR TEXT:\"" + safeTerm + "\")";
        // Only content that lives in a space (Share site); Alfresco itself filters by the user's permissions.
        String sitePath = siteId != null
                ? "/app:company_home/st:sites/cm:" + siteId.replaceAll("[^a-zA-Z0-9_-]", "") + "//*"
                : "/app:company_home/st:sites//*";
        afts += " AND PATH:\"" + sitePath + "\"";
        query.put("query", afts);
        query.put("language", "afts");
        body.putArray("include").add("path"); // ancestors, so the UI can show where a hit lives
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

    /** Files only (TYPE:"cm:content"), newest-modified first - backs the dashboard's "Recent documents" list. */
    public JsonNode recentFiles(int maxItems) {
        ObjectNode body = mapper.createObjectNode();
        ObjectNode query = body.putObject("query");
        query.put("query", "TYPE:\"cm:content\" AND PATH:\"/app:company_home/st:sites//*\"");
        query.put("language", "afts");
        ObjectNode sortEntry = mapper.createObjectNode();
        sortEntry.put("type", "FIELD");
        sortEntry.put("field", "cm:modified");
        sortEntry.put("ascending", false);
        body.putArray("sort").add(sortEntry);
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

    private JsonNode put(String path, Object body) {
        return core.put()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    private JsonNode wfGet(String path, Map<String, Object> queryParams) {
        return workflow.get()
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

    private JsonNode wfPost(String path, Object body) {
        return workflow.post()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    private JsonNode wfPut(String path, Object body) {
        return workflow.put()
                .uri(path)
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .body(JsonNode.class);
    }

    private void wfDelete(String path) {
        workflow.delete()
                .uri(path)
                .retrieve()
                .onStatus(HttpStatusCode::isError, this::handleError)
                .toBodilessEntity();
    }

    private void handleError(org.springframework.http.HttpRequest req,
                              org.springframework.http.client.ClientHttpResponse resp) throws java.io.IOException {
        String body = new String(resp.getBody().readAllBytes());
        log.warn("Alfresco API error {} on {} {}: {}", resp.getStatusCode().value(), req.getMethod(), req.getURI(), body);
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
