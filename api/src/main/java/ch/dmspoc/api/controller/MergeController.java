package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.MergeRequest;
import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.exception.AlfrescoApiException;
import ch.dmspoc.api.service.AlfrescoService;
import ch.dmspoc.api.service.WorkspaceService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Merges documents in mixed formats (PDF, Word, Excel, JPEG, TIFF, ...) into one PDF, stored back in Alfresco. */
@RestController
public class MergeController {

    private final AlfrescoService alfrescoService;
    private final WorkspaceService workspaceService;

    public MergeController(AlfrescoService alfrescoService, WorkspaceService workspaceService) {
        this.alfrescoService = alfrescoService;
        this.workspaceService = workspaceService;
    }

    @PostMapping("/api/merge")
    public NodeDto merge(@Valid @RequestBody MergeRequest request, HttpSession session) {
        boolean admin = Boolean.TRUE.equals(session.getAttribute(AuthController.SESSION_ADMIN_ATTR));
        if (!admin) {
            // Same confinement WorkspaceScopeInterceptor applies to /api/nodes/**.
            boolean allInside = workspaceService.findInWorkspace(request.targetParentId()).isPresent()
                    && request.nodeIds().stream().allMatch(id -> workspaceService.findInWorkspace(id).isPresent());
            if (!allInside) throw new AlfrescoApiException(403, "Outside the workspace");
        }
        return alfrescoService.mergeToPdf(request.nodeIds(), request.targetParentId(), request.fileName());
    }
}
