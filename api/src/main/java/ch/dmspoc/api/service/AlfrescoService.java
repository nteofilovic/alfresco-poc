package ch.dmspoc.api.service;

import ch.dmspoc.api.dto.AnnotationInfo;
import ch.dmspoc.api.dto.FolderNode;
import ch.dmspoc.api.dto.FolderTemplateDto;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.NodePage;
import ch.dmspoc.api.dto.StickyNote;
import ch.dmspoc.api.exception.AlfrescoApiException;
import ch.dmspoc.api.exception.RequestRejectedException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.time.Instant;
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

    private static final Logger log = LoggerFactory.getLogger(AlfrescoService.class);

    private final AlfrescoClient client;
    private final ObjectMapper mapper;
    private final DocumentMergeService mergeService;
    private final FolderTemplateService templates;
    private final PdfAnnotationService pdfAnnotations;
    private final AnnotationStore annotations;

    public AlfrescoService(AlfrescoClient client, ObjectMapper mapper, DocumentMergeService mergeService,
                           FolderTemplateService templates, PdfAnnotationService pdfAnnotations,
                           AnnotationStore annotations) {
        this.client = client;
        this.mapper = mapper;
        this.mergeService = mergeService;
        this.templates = templates;
        this.pdfAnnotations = pdfAnnotations;
        this.annotations = annotations;
    }

    // --------------------------------------------------------------- browsing

    public NodeDto getNode(String nodeId) {
        // "path" gives the folder chain, so a shared link can open the document in its folder.
        return toNodeDto(client.getNode(nodeId, "properties,aspectNames,path").path("entry"));
    }

    public List<NodeDto> listChildren(String parentId, int skip, int maxItems) {
        JsonNode entries = client.listChildren(parentId, null, skip, maxItems).path("list").path("entries");
        return markAnnotated(StreamSupport.stream(entries.spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList());
    }

    private static final Map<String, String> SORT_FIELDS = Map.of(
            "name", "name",
            "modifiedAt", "modifiedAt",
            "owner", "createdByUser.id",
            "sizeInBytes", "content.sizeInBytes");

    /** Folders first, then {@code sortBy} in {@code sortDir}, then name as tie-breaker. Bad values are a 400. */
    public NodePage listChildrenPage(String parentId, int skip, int maxItems, String sortBy, String sortDir) {
        String field = SORT_FIELDS.get(sortBy);
        if (field == null) throw new AlfrescoApiException(400, "sortBy must be one of " + SORT_FIELDS.keySet());
        if (!"asc".equalsIgnoreCase(sortDir) && !"desc".equalsIgnoreCase(sortDir)) {
            throw new AlfrescoApiException(400, "sortDir must be asc or desc");
        }
        if (skip < 0) throw new AlfrescoApiException(400, "skip must be >= 0");
        int max = Math.max(1, Math.min(100, maxItems));
        String orderBy = "isFolder DESC," + field + " " + sortDir.toUpperCase()
                + ("name".equals(field) ? "" : ",name ASC");
        JsonNode list = client.listChildren(parentId, null, skip, max, orderBy).path("list");
        List<NodeDto> items = markAnnotated(StreamSupport.stream(list.path("entries").spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList());
        JsonNode pg = list.path("pagination");
        return new NodePage(items, pg.path("totalItems").asInt(items.size()), skip, max,
                pg.path("hasMoreItems").asBoolean(false));
    }

    /** @param memberFolder true when a non-admin creates it: tagged so they can later rename, move or delete it */
    public NodeDto createFolder(String parentId, String name, boolean memberFolder) {
        String mark = memberFolder ? FolderTemplateService.MEMBER_FOLDER_MARK : null;
        return toNodeDto(client.createFolder(parentId, name, mark).path("entry"));
    }

    /**
     * Creates a folder named {@code name} in {@code parentId} with the template's subfolders inside it, all
     * with the member's ticket (Alfresco decides whether they may add content there). The top folder is
     * tagged so members can rename/move/delete it; the subfolders are fixed structure.
     */
    public NodeDto createFromTemplate(String parentId, String templateId, String name) {
        FolderTemplateDto template = templates.find(templateId)
                .orElseThrow(() -> new AlfrescoApiException(404, "Folder template not found"));
        JsonNode top = client.createFolder(parentId, name.trim(), FolderTemplateService.TEMPLATE_MARK + template.name()).path("entry");
        try {
            createTemplateChildren(top.path("id").asText(), template.folders());
        } catch (RuntimeException e) {
            try {
                client.deleteNode(top.path("id").asText(), true);
            } catch (RuntimeException ignored) {
                // best effort; the original error is the useful one
            }
            throw e;
        }
        return toNodeDto(top);
    }

    private void createTemplateChildren(String parentId, List<FolderNode> folders) {
        if (folders == null) return;
        for (FolderNode folder : folders) {
            String id = client.createFolder(parentId, folder.name(), SpaceService.STRUCTURE_MARK).path("entry").path("id").asText();
            createTemplateChildren(id, folder.children());
        }
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

    public NodeDto renameNode(String nodeId, String newName) {
        JsonNode current = client.getNode(nodeId, "properties").path("entry");
        if (current.path("isFolder").asBoolean(false)
                && SpaceService.STRUCTURE_MARK.equals(current.path("properties").path("cm:description").asText(null))) {
            throw new AlfrescoApiException(403, "This folder is part of the workspace structure and cannot be renamed");
        }
        ObjectNode body = mapper.createObjectNode();
        body.put("name", newName.trim());
        return toNodeDto(client.updateNode(nodeId, body).path("entry"));
    }

    public NodeDto moveNode(String nodeId, String targetParentId) {
        return toNodeDto(client.moveNode(nodeId, targetParentId).path("entry"));
    }

    public NodeDto copyNode(String nodeId, String targetParentId) {
        return toNodeDto(client.copyNode(nodeId, targetParentId).path("entry"));
    }

    public byte[] downloadContent(String nodeId) {
        return client.getContent(nodeId);
    }

    // ------------------------------------------------------------ annotations
    // The original PDF is never changed: annotated copies live in AnnotationStore. That store runs as the service
    // account, so each method first asks Alfresco, with the user's ticket, whether the caller may read (or update) the node.

    /** Annotation state for a document the caller can read. */
    public AnnotationInfo getAnnotations(String nodeId) {
        JsonNode entry = client.getNode(nodeId, null).path("entry");
        return annotationInfo(nodeId, versionLabel(entry));
    }

    /** The annotated copy, empty when the document has none. */
    public Optional<byte[]> getAnnotatedContent(String nodeId) {
        client.getNode(nodeId, null);
        return annotations.pdf(nodeId);
    }

    /** Name for the "download with annotations" file: {@code report.pdf} becomes {@code report (annotated).pdf}. */
    public String annotatedFileName(String nodeId) {
        String name = client.getNode(nodeId, null).path("entry").path("name").asText(nodeId);
        return name.toLowerCase().endsWith(".pdf") ? name.substring(0, name.length() - 4) + " (annotated).pdf" : name + " (annotated).pdf";
    }

    /**
     * Stores the PDF annotated in the browser (plus extra sticky notes) next to, not over, the original.
     * {@code baseRevision} is the revision the client started from; if someone saved since, the edit is refused.
     * Saving also re-bases the annotations onto the document's current version.
     */
    public AnnotationInfo saveAnnotations(String nodeId, byte[] annotated, List<StickyNote> notes, String author,
                                          long baseRevision) {
        JsonNode entry = requireUpdatable(nodeId);
        if (!"application/pdf".equals(entry.path("content").path("mimeType").asText(null))) {
            throw new RequestRejectedException(415, "Only PDF files can be annotated.");
        }
        long stored = annotations.meta(nodeId).map(AnnotationStore.Meta::revision).orElse(0L);
        if (baseRevision != stored) {
            throw new RequestRejectedException(409, "These annotations were changed by someone else. Reload the document before saving yours.");
        }
        pdfAnnotations.validate(client.getContent(nodeId), annotated);
        byte[] result = pdfAnnotations.addNotes(annotated, notes, author);
        String version = versionLabel(entry);
        AnnotationStore.Meta meta = new AnnotationStore.Meta(version, author, Instant.now().toString(), stored + 1);
        annotations.save(nodeId, result, meta);
        return annotationInfo(meta, version);
    }

    public void deleteAnnotations(String nodeId) {
        requireUpdatable(nodeId);
        annotations.delete(nodeId);
    }

    private JsonNode requireUpdatable(String nodeId) {
        JsonNode entry = client.getNode(nodeId, "allowableOperations").path("entry");
        boolean mayUpdate = false;
        for (JsonNode op : entry.path("allowableOperations")) mayUpdate |= "update".equals(op.asText());
        if (!mayUpdate) throw new RequestRejectedException(403, "You do not have permission to annotate this document.");
        return entry;
    }

    private static String versionLabel(JsonNode entry) {
        return entry.path("properties").path("cm:versionLabel").asText(null);
    }

    private AnnotationInfo annotationInfo(String nodeId, String currentVersion) {
        return annotations.meta(nodeId)
                .map(m -> annotationInfo(m, currentVersion))
                .orElseGet(() -> AnnotationInfo.none(currentVersion));
    }

    private static AnnotationInfo annotationInfo(AnnotationStore.Meta m, String currentVersion) {
        boolean outdated = m.baseVersion() != null && currentVersion != null && !m.baseVersion().equals(currentVersion);
        return new AnnotationInfo(true, outdated, m.baseVersion(), currentVersion, m.revision(), m.updatedBy(), m.updatedAt());
    }

    /**
     * A permanent delete also drops the annotated copy; a delete to the trash keeps it, because restoring the
     * document brings back the same node id.
     */
    public void deleteNode(String nodeId, boolean permanent) {
        client.deleteNode(nodeId, permanent);
        if (permanent) {
            try {
                annotations.delete(nodeId);
            } catch (RuntimeException e) {
                log.warn("Could not remove the annotations of deleted node {}", nodeId, e);
            }
        }
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
        return search(term, maxItems, null);
    }

    public List<NodeDto> search(String term, int maxItems, String siteId) {
        JsonNode entries = client.search(term, maxItems, siteId).path("list").path("entries");
        return markAnnotated(StreamSupport.stream(entries.spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList());
    }

    public List<NodeDto> recentDocuments(int maxItems) {
        JsonNode entries = client.recentFiles(maxItems).path("list").path("entries");
        return markAnnotated(StreamSupport.stream(entries.spliterator(), false)
                .map(e -> toNodeDto(e.path("entry")))
                .toList());
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

        // Browsers cannot display TIFF, so it is served as a PDF with one page per frame.
        if ("image/tiff".equals(mimeType)) {
            try {
                return Optional.of(new PreviewResult(mergeService.tiffToPdf(client.getContent(nodeId)), "application/pdf"));
            } catch (IOException e) {
                return Optional.empty();
            }
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

    /**
     * Flags the PDFs of a listing that have annotations (one lookup for the whole list), so the client can offer
     * "Download with annotations" the moment a menu opens. A failing lookup only costs that flag, not the listing.
     */
    private List<NodeDto> markAnnotated(List<NodeDto> nodes) {
        if (nodes.stream().noneMatch(n -> "application/pdf".equals(n.mimeType()))) return nodes;
        try {
            Set<String> annotated = annotations.annotatedIds();
            if (annotated.isEmpty()) return nodes;
            return nodes.stream().map(n -> annotated.contains(n.id()) ? n.withAnnotations(true) : n).toList();
        } catch (RuntimeException e) {
            log.warn("Could not look up annotations for a listing", e);
            return nodes;
        }
    }

    private NodeDto toNodeDto(JsonNode e) {
        List<String> aspects = new ArrayList<>();
        e.path("aspectNames").forEach(a -> aspects.add(a.asText()));

        Map<String, Object> properties = e.has("properties")
                ? mapper.convertValue(e.get("properties"), Map.class)
                : Map.of();

        List<NodeDto.PathElement> ancestors = new ArrayList<>();
        e.path("path").path("elements").forEach(p ->
                ancestors.add(new NodeDto.PathElement(p.path("id").asText(), p.path("name").asText())));

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
                properties,
                ancestors,
                false
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
