package ch.dmspoc.api.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Creates a Space (Share site); its content comes from members creating folders from folder templates.
 * {@code id} is the site short name; when blank it is derived from the title.
 * {@code visibility} is PRIVATE (default), MODERATED or PUBLIC - only PRIVATE keeps non-members out.
 */
public record CreateSpaceRequest(
        String id,
        @NotBlank String title,
        String description,
        String visibility
) {
}
