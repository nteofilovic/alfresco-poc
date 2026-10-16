package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.NodeDto;
import ch.dmspoc.api.service.AlfrescoService;
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
     * Full-text + filename search backed by Alfresco's Solr index, across all spaces by default or
     * within one ({@code siteId}). The search runs with the user's ticket, so Alfresco only returns
     * what that user may read.
     */
    @GetMapping("/api/search")
    public List<NodeDto> search(@RequestParam String q, @RequestParam(defaultValue = "50") int maxItems,
                                @RequestParam(required = false) String siteId) {
        return alfrescoService.search(q, maxItems, siteId == null || siteId.isBlank() ? null : siteId);
    }
}
