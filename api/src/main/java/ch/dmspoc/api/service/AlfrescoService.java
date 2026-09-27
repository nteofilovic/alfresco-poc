package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.SiteDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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

    /**
     * Alfresco's "where" filter on /children only supports isFolder/isFile/nodeType, not name, so
     * matching by name is done client-side over the (typically small) list of existing subfolders.
     */
    private String findOrCreateChildFolder(String parentId, String name) {
        JsonNode entries = client.listChildren(parentId, "(isFolder=true)", 0, 1000)
                .path("list").path("entries");
        for (JsonNode e : entries) {
            JsonNode entry = e.path("entry");
            if (name.equals(entry.path("name").asText())) {
                return entry.path("id").asText();
            }
        }
        return client.createFolder(parentId, name).path("entry").path("id").asText();
    }

    // ---------------------------------------------------------------- preview

    public record PreviewResult(byte[] content, String mimeType) {
    }

    /**
     * Formats Alfresco's Transform Service can render to PDF via the "pdf" rendition - the same
     * mechanism {@link #fetchForMerge} uses. Anything not in here or in the natively-previewable
     * set (PDF, images) gets no preview, same as Alfresco Share falling back to a generic icon.
     */
    private static final Set<String> OFFICE_PREVIEWABLE_MIME_TYPES = Set.of(
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/vnd.oasis.opendocument.text",
            "application/vnd.oasis.opendocument.spreadsheet",
            "application/vnd.oasis.opendocument.presentation",
            "application/rtf",
            "text/plain",
            "text/csv"
    );

    /** Empty means "no preview available for this file type", not an error - the UI falls back to an icon + download. */
    public Optional<PreviewResult> getPreview(String nodeId) {
        JsonNode entry = client.getNode(nodeId, null).path("entry");
        String mimeType = entry.path("content").path("mimeType").asText(null);
        if (mimeType == null) {
            return Optional.empty();
        }

        if ("application/pdf".equals(mimeType) || mimeType.startsWith("image/")) {
            return Optional.of(new PreviewResult(client.getContent(nodeId), mimeType));
        }

        if (OFFICE_PREVIEWABLE_MIME_TYPES.contains(mimeType)) {
            try {
                client.requestRendition(nodeId, "pdf");
                byte[] pdfBytes = client.waitForRenditionContent(nodeId, "pdf", Duration.ofSeconds(30));
                return Optional.of(new PreviewResult(pdfBytes, "application/pdf"));
            } catch (AlfrescoApiException e) {
                return Optional.empty();
            }
        }

        return Optional.empty();
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

        Map<String, Object> properties = e.has("properties")
                ? mapper.convertValue(e.get("properties"), Map.class)
                : Map.of();

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
                properties
        );
    }

    // Alfresco returns dates like "2026-09-27T14:23:52.862+0000" - a valid ISO-8601 offset,
    // but without the colon that OffsetDateTime.parse()'s default formatter requires.
    private static final java.time.format.DateTimeFormatter ALFRESCO_DATE_FORMAT =
            java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSSZ");

    private OffsetDateTime parseDate(String s) {
        return s == null ? null : OffsetDateTime.parse(s, ALFRESCO_DATE_FORMAT);
    }
}
