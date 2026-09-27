package ch.dmspoc.api.controller;

import ch.dmspoc.api.config.AlfrescoProperties;
import ch.dmspoc.api.dto.CreateFolderRequest;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.dto.UpdateMetadataRequest;
import ch.dmspoc.api.service.AlfrescoService;
import jakarta.validation.Valid;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * Browsing, upload/download, and metadata for Alfresco nodes (files and folders).
 * "-my-" as a nodeId resolves to the logged-in user's Home folder; "-root-" is the repository root.
 */
@RestController
@RequestMapping("/api/nodes")
public class NodeController {

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

    @GetMapping("/root/children")
    public List<NodeDto> listDefaultRoot(@RequestParam(defaultValue = "0") int skip,
                                          @RequestParam(defaultValue = "100") int maxItems) {
        return alfrescoService.listChildren(props.defaultParentId(), skip, maxItems);
    }

    @PostMapping("/{parentId}/folders")
    public NodeDto createFolder(@PathVariable String parentId, @Valid @RequestBody CreateFolderRequest request) {
        return alfrescoService.createFolder(parentId, request.name());
    }

    @PostMapping(value = "/{parentId}/files", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public NodeDto uploadFile(@PathVariable String parentId,
                               @RequestPart("file") MultipartFile file,
                               @RequestParam(defaultValue = "false") boolean overwrite) {
        return alfrescoService.uploadFile(parentId, file, overwrite);
    }

    @GetMapping("/{nodeId}/content")
    public ResponseEntity<ByteArrayResource> downloadContent(@PathVariable String nodeId) {
        NodeDto node = alfrescoService.getNode(nodeId);
        byte[] content = alfrescoService.downloadContent(nodeId);
        return ResponseEntity.ok()
                .contentType(node.mimeType() != null ? MediaType.parseMediaType(node.mimeType()) : MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + node.name() + "\"")
                .body(new ByteArrayResource(content));
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
