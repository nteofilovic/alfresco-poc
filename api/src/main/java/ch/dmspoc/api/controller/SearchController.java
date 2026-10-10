package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.service.AlfrescoService;
import ch.dmspoc.api.service.WorkspaceService;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class SearchController {

    private final AlfrescoService alfrescoService;

    public SearchController(AlfrescoService alfrescoService) {
        this.alfrescoService = alfrescoService;
    }

    /**
     * Full-text + filename search backed by Alfresco's Solr index. Admins search the whole
     * repository; everyone else only the workspace.
     */
    @GetMapping("/api/search")
    public List<NodeDto> search(@RequestParam String q, @RequestParam(defaultValue = "50") int maxItems, HttpSession session) {
        boolean admin = Boolean.TRUE.equals(session.getAttribute(AuthController.SESSION_ADMIN_ATTR));
        return alfrescoService.search(q, maxItems, admin ? null : WorkspaceService.SITE_ID);
    }
}
