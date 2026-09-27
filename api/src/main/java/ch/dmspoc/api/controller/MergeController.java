package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.MergeRequest;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.service.AlfrescoService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Merges documents in mixed formats (PDF, Word, Excel, JPEG, TIFF, ...) into one PDF, stored back in Alfresco. */
@RestController
public class MergeController {

    private final AlfrescoService alfrescoService;

    public MergeController(AlfrescoService alfrescoService) {
        this.alfrescoService = alfrescoService;
    }

    @PostMapping("/api/merge")
    public NodeDto merge(@Valid @RequestBody MergeRequest request) {
        return alfrescoService.mergeToPdf(request.nodeIds(), request.targetParentId(), request.fileName());
    }
}
