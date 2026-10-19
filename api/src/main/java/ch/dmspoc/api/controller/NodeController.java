package ch.dmspoc.api.controller;

import ch.dmspoc.api.config.AlfrescoProperties;
import ch.dmspoc.api.dto.AnnotationInfo;
import ch.dmspoc.api.dto.CreateFolderRequest;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.NodePage;
import ch.dmspoc.api.dto.StickyNote;
import ch.dmspoc.api.dto.UpdateMetadataRequest;
import ch.dmspoc.api.exception.RequestRejectedException;
import ch.dmspoc.api.service.AlfrescoService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Supplier;

/**
 * Browsing, upload/download, and metadata for Alfresco nodes (files and folders).
 * "-my-" as a nodeId resolves to the logged-in user's Home folder; "-root-" is the repository root.
 */
@RestController
@RequestMapping("/api/nodes")
public class NodeController {

    private static final Supplier<RequestRejectedException> NO_ANNOTATIONS =
            () -> new RequestRejectedException(404, "This document has no annotations.");

    private final AlfrescoService alfrescoService;
    private final AlfrescoProperties props;

    public NodeController(AlfrescoService alfrescoService, AlfrescoProperties props) {
        this.alfrescoService = alfrescoService;
        this.props = props;
    }

    @GetMapping("/{nodeId}")
    public NodeDto getNode(@PathVariable String nodeId) {
        return alfrescoService.getNode(nodeId);
    }

    @GetMapping("/{nodeId}/children")
    public List<NodeDto> listChildren(@PathVariable String nodeId,
                                       @RequestParam(defaultValue = "0") int skip,
                                       @RequestParam(defaultValue = "100") int maxItems) {
        return alfrescoService.listChildren(nodeId, skip, maxItems);
    }

    /** Paged + sorted listing (folders first). sortBy: name|modifiedAt|owner|sizeInBytes; sortDir: asc|desc. */
    @GetMapping("/{nodeId}/page")
    public NodePage listChildrenPage(@PathVariable String nodeId,
                                     @RequestParam(defaultValue = "0") int skip,
                                     @RequestParam(defaultValue = "20") int maxItems,
                                     @RequestParam(defaultValue = "name") String sortBy,
                                     @RequestParam(defaultValue = "asc") String sortDir) {
        return alfrescoService.listChildrenPage(nodeId, skip, maxItems, sortBy, sortDir);
    }

    @GetMapping("/root/children")
    public List<NodeDto> listDefaultRoot(@RequestParam(defaultValue = "0") int skip,
                                          @RequestParam(defaultValue = "100") int maxItems) {
        return alfrescoService.listChildren(props.defaultParentId(), skip, maxItems);
    }

    /** Files only, newest-modified first - backs the dashboard's "Recent documents" list. */
    @GetMapping("/recent")
    public List<NodeDto> recentDocuments(@RequestParam(defaultValue = "20") int maxItems) {
        return alfrescoService.recentDocuments(maxItems);
    }

    @PostMapping("/{parentId}/folders")
    public NodeDto createFolder(@PathVariable String parentId, @Valid @RequestBody CreateFolderRequest request,
                                HttpSession session) {
        boolean admin = Boolean.TRUE.equals(session.getAttribute(AuthController.SESSION_ADMIN_ATTR));
        return alfrescoService.createFolder(parentId, request.name(), !admin);
    }

    public record FromTemplateRequest(
            @jakarta.validation.constraints.NotBlank String templateId,
            @jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Pattern(regexp = "[^\\\\/*?:\"<>|]+", message = "must not contain \\ / * ? : \" < > |")
            String name) {
    }

    /** Members create a Client, Property... here: a folder from an admin-designed template, in {@code parentId}. */
    @PostMapping("/{parentId}/from-template")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    public NodeDto createFromTemplate(@PathVariable String parentId, @Valid @RequestBody FromTemplateRequest request) {
        return alfrescoService.createFromTemplate(parentId, request.templateId(), request.name());
    }

    public record TargetRequest(@jakarta.validation.constraints.NotBlank String targetParentId) {
    }

    public record RenameRequest(
            @jakarta.validation.constraints.NotBlank
            @jakarta.validation.constraints.Pattern(regexp = "[^\\/*?:\"<>|]+", message = "must not contain \\ / * ? : \" < > |")
            String name) {
    }

    @PutMapping("/{nodeId}/name")
    public NodeDto rename(@PathVariable String nodeId, @Valid @RequestBody RenameRequest request) {
        return alfrescoService.renameNode(nodeId, request.name());
    }

    // The destination is in the body; Alfresco checks the user's permission on it.
    @PostMapping("/{nodeId}/move")
    public NodeDto move(@PathVariable String nodeId, @Valid @RequestBody TargetRequest request) {
        return alfrescoService.moveNode(nodeId, request.targetParentId());
    }

    @PostMapping("/{nodeId}/copy")
    public NodeDto copy(@PathVariable String nodeId, @Valid @RequestBody TargetRequest request) {
        return alfrescoService.copyNode(nodeId, request.targetParentId());
    }

    @PostMapping(value = "/{parentId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public NodeDto uploadFile(@PathVariable String parentId,
                               @RequestPart("file") MultipartFile file,
                               @RequestParam(defaultValue = "false") boolean overwrite) {
        return alfrescoService.uploadFile(parentId, file, overwrite);
    }

    /** The original file; with {@code annotations=true} the copy with its annotations (404 when it has none). */
    @GetMapping("/{nodeId}/content")
    public ResponseEntity<ByteArrayResource> downloadContent(@PathVariable String nodeId,
                                                             @RequestParam(defaultValue = "false") boolean annotations) {
        if (annotations) {
            byte[] annotated = alfrescoService.getAnnotatedContent(nodeId).orElseThrow(NO_ANNOTATIONS);
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                            .filename(alfrescoService.annotatedFileName(nodeId), StandardCharsets.UTF_8).build().toString())
                    .body(new ByteArrayResource(annotated));
        }
        NodeDto node = alfrescoService.getNode(nodeId);
        byte[] content = alfrescoService.downloadContent(nodeId);
        return ResponseEntity.ok()
                .contentType(node.mimeType() != null ? MediaType.parseMediaType(node.mimeType()) : MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + node.name() + "\"")
                .body(new ByteArrayResource(content));
    }

    // ------------------------------------------------------------ annotations (the original is never changed)

    @GetMapping("/{nodeId}/annotations")
    public AnnotationInfo getAnnotations(@PathVariable String nodeId) {
        return alfrescoService.getAnnotations(nodeId);
    }

    /** The annotated copy, inline so the preview can show it. */
    @GetMapping("/{nodeId}/annotations/content")
    public ResponseEntity<ByteArrayResource> annotatedContent(@PathVariable String nodeId) {
        byte[] annotated = alfrescoService.getAnnotatedContent(nodeId).orElseThrow(NO_ANNOTATIONS);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                .body(new ByteArrayResource(annotated));
    }

    /**
     * Stores a PDF annotated in the browser as the document's annotated copy. Parts: {@code file} is the PDF,
     * {@code notes} an optional JSON array of sticky notes to add. {@code baseRevision} is the revision the
     * client started from, 0 for none (409 if someone saved since).
     */
    @PutMapping(value = "/{nodeId}/annotations", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public AnnotationInfo saveAnnotations(@PathVariable String nodeId,
                                          @RequestParam(defaultValue = "0") long baseRevision,
                                          @RequestPart("file") MultipartFile file,
                                          @RequestPart(value = "notes", required = false) List<@Valid StickyNote> notes,
                                          HttpSession session) throws IOException {
        String author = session.getAttribute(AuthController.SESSION_USER_ATTR) instanceof String u ? u : null;
        return alfrescoService.saveAnnotations(nodeId, file.getBytes(), notes, author, baseRevision);
    }

    @DeleteMapping("/{nodeId}/annotations")
    public ResponseEntity<Void> deleteAnnotations(@PathVariable String nodeId) {
        alfrescoService.deleteAnnotations(nodeId);
        return ResponseEntity.noContent().build();
    }

    /**
     * Renders inline (not "attachment") so the browser can display it in an &lt;iframe&gt;/&lt;img&gt;
     * instead of downloading it, similar to Alfresco Share's document preview. Returns 204 when the
     * file type has no preview (see {@link AlfrescoService#getPreview}); the frontend falls back to
     * a plain download prompt in that case.
     */
    @GetMapping("/{nodeId}/preview")
    public ResponseEntity<?> preview(@PathVariable String nodeId) {
        return alfrescoService.getPreview(nodeId)
                .map(p -> ResponseEntity.ok()
                        .contentType(MediaType.parseMediaType(p.mimeType()))
                        .header(HttpHeaders.CONTENT_DISPOSITION, "inline")
                        .body(new ByteArrayResource(p.content())))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @DeleteMapping("/{nodeId}")
    public ResponseEntity<Void> deleteNode(@PathVariable String nodeId,
                                            @RequestParam(defaultValue = "false") boolean permanent) {
        alfrescoService.deleteNode(nodeId, permanent);
        return ResponseEntity.noContent().build();
    }

    /** Applies a custom aspect (metadata "form") and its property values - the metadata-model side of the ask. */
    @PutMapping("/{nodeId}/metadata")
    public NodeDto updateMetadata(@PathVariable String nodeId, @RequestBody UpdateMetadataRequest request) {
        return alfrescoService.updateMetadata(nodeId, request.aspectNames(), request.properties());
    }
}
