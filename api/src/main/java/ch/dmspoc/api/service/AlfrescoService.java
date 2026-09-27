package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.SiteDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;

/** Maps Alfresco's raw REST JSON onto this app's DTOs, and hosts the business logic that isn't a 1:1 API call. */
@Service
public class AlfrescoService {

    private final AlfrescoClient client;
    private final ObjectMapper mapper;
    private final DocumentMergeService mergeService;

    public AlfrescoService(AlfrescoClient client, ObjectMapper mapper, DocumentMergeService mergeService) {
        this.client = client;
        this.mapper = mapper;
        this.mergeService = mergeService;
    }

    // --------------------------------------------------------------- browsing

    public NodeDto getNode(String nodeId) {
        return toNodeDto(client.getNode(nodeId, "properties,aspectNames").path("entry"));
    }

    public List<NodeDto> listChildren(String parentId, int skip, int maxItems) {
        JsonNode entries = client.listChildren(parentId, null, skip, maxItems).path("list").path("entries");
        return StreamSupport.stream(entries.spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList();
    }

    public NodeDto createFolder(String parentId, String name) {
        return toNodeDto(client.createFolder(parentId, name).path("entry"));
    }

    public NodeDto uploadFile(String parentId, MultipartFile file, boolean overwrite) {
        try {
            var raw = client.uploadFile(parentId, file.getOriginalFilename(), file.getBytes(),
                    file.getContentType(), overwrite);
            return toNodeDto(raw.path("entry"));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not read uploaded file", e);
        }
    }

    public byte[] downloadContent(String nodeId) {
        return client.getContent(nodeId);
    }

    public void deleteNode(String nodeId, boolean permanent) {
        client.deleteNode(nodeId, permanent);
    }

    public NodeDto updateMetadata(String nodeId, List<String> aspectNames, Map<String, Object> properties) {
        ObjectNode body = mapper.createObjectNode();
        if (aspectNames != null && !aspectNames.isEmpty()) {
            var arr = body.putArray("aspectNames");
            aspectNames.forEach(arr::add);
        }
        if (properties != null && !properties.isEmpty()) {
            body.set("properties", mapper.valueToTree(properties));
        }
        return toNodeDto(client.updateNode(nodeId, body).path("entry"));
    }

    public List<NodeDto> search(String term, int maxItems) {
        JsonNode entries = client.search(term, maxItems).path("list").path("entries");
        return StreamSupport.stream(entries.spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList();
    }

    // ------------------------------------------------------------------ sites

    public SiteDto createSiteWithTemplate(String id, String title, String description, String visibility,
                                           List<String> folderTemplate) {
        client.createSite(id, title, description, visibility);
        // "documentLibrary" is Alfresco's standard container id for a site's main folder.
        String docLibId = client.getSiteContainer(id, "documentLibrary").path("entry").path("id").asText();

        if (folderTemplate != null) {
            for (String relativePath : folderTemplate) {
                createFolderPath(docLibId, relativePath);
            }
        }
        return new SiteDto(id, title, description, visibility, docLibId);
    }

    /** Creates "A/B/C" as nested folders under root, reusing any that already exist. */
    private void createFolderPath(String rootId, String relativePath) {
        String currentParent = rootId;
        for (String segment : relativePath.split("/")) {
            if (segment.isBlank()) continue;
            currentParent = findOrCreateChildFolder(currentParent, segment.trim());
        }
    }

    private String findOrCreateChildFolder(String parentId, String name) {
        JsonNode entries = client.listChildren(parentId,
                "(name='" + name.replace("'", "\\'") + "' and isFolder=true)", 0, 1)
                .path("list").path("entries");
        if (entries.isArray() && !entries.isEmpty()) {
            return entries.get(0).path("entry").path("id").asText();
        }
        return client.createFolder(parentId, name).path("entry").path("id").asText();
    }

    // ------------------------------------------------------------------ merge

    /** See {@link DocumentMergeService} for how each source format becomes a PDF page. */
    public NodeDto mergeToPdf(List<String> nodeIds, String targetParentId, String fileName) {
        byte[] merged = mergeService.merge(nodeIds, this::fetchForMerge);
        String finalName = fileName.toLowerCase().endsWith(".pdf") ? fileName : fileName + ".pdf";
        var raw = client.uploadFile(targetParentId, finalName, merged, "application/pdf", true);
        return toNodeDto(raw.path("entry"));
    }

    private DocumentMergeService.SourceDocument fetchForMerge(String nodeId) {
        JsonNode entry = client.getNode(nodeId, null).path("entry");
        String mimeType = entry.path("content").path("mimeType").asText("application/octet-stream");
        String name = entry.path("name").asText(nodeId);

        if ("application/pdf".equals(mimeType)) {
            return new DocumentMergeService.SourceDocument(name, mimeType, client.getContent(nodeId));
        }
        if (mimeType.startsWith("image/")) {
            return new DocumentMergeService.SourceDocument(name, mimeType, client.getContent(nodeId));
        }
        // Anything else (Word, Excel, ...): ask Alfresco/Transform Service for a PDF rendition.
        client.requestRendition(nodeId, "pdf");
        byte[] pdfBytes = client.waitForRenditionContent(nodeId, "pdf", java.time.Duration.ofSeconds(60));
        return new DocumentMergeService.SourceDocument(name, "application/pdf", pdfBytes);
    }

    // ---------------------------------------------------------------- mapping

    private NodeDto toNodeDto(JsonNode e) {
        List<String> aspects = new ArrayList<>();
        e.path("aspectNames").forEach(a -> aspects.add(a.asText()));

        Map<String, Object> properties = mapper.convertValue(e.path("properties"), Map.class);

        return new NodeDto(
                e.path("id").asText(),
                e.path("name").asText(),
                e.path("isFolder").asBoolean(false),
                e.path("isFile").asBoolean(false),
                e.path("nodeType").asText(),
                e.path("content").path("mimeType").asText(null),
                e.path("content").has("sizeInBytes") ? e.path("content").path("sizeInBytes").asLong() : null,
                parseDate(e.path("createdAt").asText(null)),
                parseDate(e.path("modifiedAt").asText(null)),
                e.path("createdByUser").path("displayName").asText(null),
                aspects,
                properties != null ? properties : Map.of()
        );
    }

    private OffsetDateTime parseDate(String s) {
        return s == null ? null : OffsetDateTime.parse(s);
    }
}
