package ch.dmspoc.api.controller;

import ch.dmspoc.api.dto.CreateSiteRequest;
import ch.dmspoc.api.dto.SiteDto;
import ch.dmspoc.api.service.AlfrescoService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Collaboration Sites, each created with a caller-supplied folder-structure
 * template applied to its Document Library - the "project folder template"
 * feature on top of Alfresco Sites.
 */
@RestController
public class SiteController {

    private final AlfrescoService alfrescoService;

    public SiteController(AlfrescoService alfrescoService) {
        this.alfrescoService = alfrescoService;
    }

    @PostMapping("/api/sites")
    public SiteDto createSite(@Valid @RequestBody CreateSiteRequest request) {
        return alfrescoService.createSiteWithTemplate(
                request.id(), request.title(), request.description(), request.visibility(), request.folderTemplate());
    }
}
