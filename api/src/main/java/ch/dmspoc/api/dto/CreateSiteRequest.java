package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Creates a Collaboration Site, then applies a folder-structure template
 * (a set of subfolder paths, e.g. "01 Contracts", "02 Invoices/Paid") to
 * its Document Library. This is how "project folder templates" per site
 * are implemented on top of Alfresco's Sites feature.
 */
public record CreateSiteRequest(
        @NotBlank String id,
        @NotBlank String title,
        String description,
        String visibility, // PUBLIC | MODERATED | PRIVATE
        java.util.List<String> folderTemplate
) {
}
